# File: app/routes/payment_routes.py
# Deskripsi: Berisi route untuk pembayaran, feedback, dan API miscellaneous.

import time
from datetime import datetime, timedelta
from flask import request, jsonify
from flask_login import login_required, current_user
from firebase_admin import firestore

from . import payment_bp
from app import firestore_db, midtrans_snap

# Mapping Kode Paket (Untuk menyingkat Order ID)
PLAN_MAP = {
    'weekly_basic': 'WB', 'weekly_pro': 'WP', 'weekly_premium': 'WPR',
    'monthly_basic': 'MB', 'monthly_pro': 'MP', 'monthly_ultimate': 'MU'
}
# Mapping Balik (Untuk membaca Order ID di Webhook)
PLAN_MAP_REVERSE = {v: k for k, v in PLAN_MAP.items()}

@payment_bp.route('/api/get-usage-status')
@login_required
def get_usage_status():
    """API untuk memeriksa sisa kuota fitur bagi pengguna gratis."""
    if current_user.is_pro:
        return jsonify({'status': 'pro', 'message': 'Akses Penuh Tanpa Batas'})

    LIMITS = {
        'paraphrase': 5, 'chat': 10, 'search': 5, 'citation': 15,
        'writing_assistant': 3, 'data_analysis': 3, 'export_doc': 1, 'generate_theory': 2
    }
    
    user_ref = firestore_db.collection('users').document(str(current_user.id))
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        return jsonify({'error': 'User not found'}), 404

    usage_data = user_doc.to_dict().get('usage_limits', {})
    
    remaining_counts = {
        key: LIMITS[key] - usage_data.get(f'{key}_count', 0) for key in LIMITS
    }

    return jsonify({
        'status': 'free',
        'limits': LIMITS,
        **{f'{key}_remaining': val for key, val in remaining_counts.items()}
    })


@payment_bp.route('/api/create-transaction', methods=['POST'])
@login_required
def create_transaction():
    """API untuk membuat token transaksi Midtrans."""
    try:
        if not midtrans_snap:
            return jsonify({'status': 'error', 'message': 'Server Key Midtrans belum dikonfigurasi.'}), 503
        
        data = request.get_json()
        plan = data.get('plan')
        amount = data.get('amount')
        
        if not plan or not amount:
            return jsonify({'status': 'error', 'message': 'Detail paket tidak lengkap.'}), 400
        
        # 1. Gunakan Kode Pendek untuk Plan
        short_plan = PLAN_MAP.get(plan, 'XX')
        
        # 2. Buat Order ID Pendek (< 50 Karakter)
        # Format: OT-{uid}-{plan}-{timestamp}
        # Contoh: OT-AbCdEf12345-MP-17154321
        uid = str(current_user.id)
        timestamp = int(time.time())
        order_id = f"OT-{uid}-{short_plan}-{timestamp}"
        
        # Pastikan panjang Order ID aman
        if len(order_id) > 50:
            # Fallback jika UID terlalu panjang: Potong UID
            order_id = f"OT-{uid[:20]}-{short_plan}-{timestamp}"

        print(f"DEBUG: Membuat Transaksi dengan Order ID: {order_id}")

        transaction_details = {"order_id": order_id, "gross_amount": int(amount)}
        
        # Data Customer (Penting untuk Midtrans)
        first_name = getattr(current_user, 'display_name', "Pengguna") or "Pengguna"
        email = getattr(current_user, 'email', "no-email@onthesis.com")
        
        customer_details = {
            "first_name": first_name[:20], # Midtrans kadang rewel kalau nama kepanjangan
            "email": email
        }
        
        # Item Details (Agar user tahu apa yang dibeli di halaman pembayaran)
        item_details = [{
            "id": plan,
            "price": int(amount),
            "quantity": 1,
            "name": f"OnThesis {plan.replace('_', ' ').title()}"
        }]
        
        payload = {
            "transaction_details": transaction_details,
            "customer_details": customer_details,
            "item_details": item_details
        }
        
        transaction = midtrans_snap.create_transaction(payload)
        return jsonify({'status': 'success', 'token': transaction['token']})

    except Exception as e:
        print(f"❌ Error Create Transaction: {e}")
        return jsonify({'status': 'error', 'message': f'Gagal memproses ke Midtrans: {str(e)}'}), 500


@payment_bp.route('/api/payment-notification', methods=['POST'])
def payment_notification():
    """Webhook untuk menerima notifikasi status pembayaran dari Midtrans."""
    try:
        notification_json = request.get_json()
        order_id = notification_json.get('order_id')
        transaction_status = notification_json.get('transaction_status')
        fraud_status = notification_json.get('fraud_status')

        print(f"🔔 Webhook Received: {order_id} | Status: {transaction_status}")

        # Logika verifikasi status
        is_paid = False
        if transaction_status == 'capture':
            if fraud_status == 'challenge':
                is_paid = False
            else:
                is_paid = True
        elif transaction_status == 'settlement':
            is_paid = True
        
        if is_paid:
            # Parse Order ID Baru: OT-{uid}-{code}-{time}
            parts = order_id.split('-')
            
            if len(parts) >= 4 and parts[0] == 'OT':
                user_id = parts[1]
                plan_code = parts[2]
                
                # Kembalikan kode pendek ke nama paket asli
                plan_name = PLAN_MAP_REVERSE.get(plan_code, 'unknown_plan')
                
                # Update User di Firestore
                user_ref = firestore_db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    current_expiry = user_data.get('proExpiryDate')
                    
                    # Hitung durasi
                    now = datetime.now().replace(tzinfo=None)
                    if current_expiry:
                        current_expiry = current_expiry.replace(tzinfo=None)
                        start_date = max(now, current_expiry)
                    else:
                        start_date = now
                    
                    # Tambah Durasi Berdasarkan Paket
                    days_to_add = 0
                    if 'weekly' in plan_name:
                        days_to_add = 7
                    elif 'monthly' in plan_name:
                        days_to_add = 30
                    
                    # Bonus 2x Skripsi untuk Ultimate? Bisa diatur di sini (misal simpan di field 'quota_skripsi')
                    
                    if days_to_add > 0:
                        new_expiry_date = start_date + timedelta(days=days_to_add)
                        
                        user_ref.update({
                            'proExpiryDate': new_expiry_date,
                            'lastSubscriptionPlan': plan_name,
                            'is_pro': True, 
                            'isPro': True
                        })
                        print(f"✅ Sukses Upgrade User {user_id} ke paket {plan_name}")

        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        print(f"❌ Error Webhook: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500