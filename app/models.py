# File: app/models.py
# Deskripsi: Model User Native Firestore (Refactored).
# Status: Production-Ready Standard.

from flask_login import UserMixin
from app import firestore_db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class User(UserMixin):
    """
    Representasi Object-Oriented untuk Dokumen User di Firestore.
    Bertindak sebagai Data Transfer Object (DTO) dan Business Entity.
    """
    
    def __init__(self, uid, email, is_pro=False, created_at=None, photo_url=None, display_name=None, usage_limits=None):
        self.id = uid
        self.email = email
        self.is_pro = bool(is_pro)
        self.photo_url = photo_url
        self.display_name = display_name
        self.username = display_name or (email.split('@')[0] if email else "User")
        self.usage_limits = usage_limits or {}
        
        # Normalisasi created_at
        if isinstance(created_at, str):
            try:
                self.created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except ValueError:
                self.created_at = datetime.utcnow()
        elif isinstance(created_at, datetime):
            self.created_at = created_at
        else:
            self.created_at = datetime.utcnow()

    @classmethod
    def from_firestore(cls, doc):
        """Factory method untuk membuat instance User dari dokumen Firestore."""
        if not doc.exists:
            return None
            
        data = doc.to_dict()
        
        # Handle inkonsistensi field legacy (isPro vs is_pro)
        # Prioritas: is_pro (format baru) -> isPro (format lama) -> False
        is_pro_status = data.get('is_pro', data.get('isPro', False))

        return cls(
            uid=doc.id,
            email=data.get('email'),
            is_pro=is_pro_status,
            created_at=data.get('created_at'),
            photo_url=data.get('photoURL') or data.get('photo_url'), # Handle camelCase vs snake_case
            display_name=data.get('displayName') or data.get('display_name'),
            usage_limits=data.get('usage_limits', {})
        )

    def to_firestore_dict(self):
        """Serialisasi object kembali ke format dictionary untuk disimpan ke Firestore."""
        return {
            'email': self.email,
            'is_pro': self.is_pro, # Standardized to snake_case internally
            'isPro': self.is_pro,  # Maintain backward compatibility for frontend JS if needed
            'photoURL': self.photo_url,
            'displayName': self.display_name,
            'created_at': self.created_at,
            'usage_limits': self.usage_limits
        }

    @staticmethod
    def get(user_id):
        if not user_id:
            return None
        try:
            doc_ref = firestore_db.collection('users').document(str(user_id))
            doc = doc_ref.get()
            return User.from_firestore(doc)
        except Exception as e:
            logger.error(f"DB Error (User.get): {e}")
            return None

    @staticmethod
    def get_by_email(email):
        try:
            users_ref = firestore_db.collection('users')
            # Limit 1 karena email harus unik
            query = users_ref.where('email', '==', email).limit(1).stream()
            
            for doc in query:
                return User.from_firestore(doc)
            return None
        except Exception as e:
            logger.error(f"DB Error (User.get_by_email): {e}")
            return None

    def __repr__(self):
        return f'<User {self.email} (ID: {self.id})>'