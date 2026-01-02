# File: app/routes/__init__.py
# Deskripsi: Mendefinisikan Blueprint dan mengimpor modul-modul route-nya.

from flask import Blueprint

# Definisikan semua blueprint di sini
main_bp = Blueprint('main', __name__)
auth_bp = Blueprint('auth', __name__)
assistant_bp = Blueprint('assistant', __name__)
analysis_bp = Blueprint('analysis', __name__)
payment_bp = Blueprint('payment', __name__)

# PERBAIKAN: Pindahkan import ke bagian paling bawah file
from . import main_routes, auth_routes, assistant_routes, analysis_routes, payment_routes