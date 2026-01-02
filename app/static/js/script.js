// File: app/static/js/script.js
// PERUBAHAN: Menghapus logika 'handleSidebarToggle' (sekarang murni CSS:hover)

import { auth } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- FUNGSI PENGELOLA TEMA ---
const handleThemeToggle = () => {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    if (!themeToggleBtn || !sunIcon || !moonIcon) return;

    // Fungsi untuk menerapkan tema dan ikon yang sesuai
    const applyTheme = (theme) => {
        if (theme === 'light') {
            document.documentElement.classList.add('light');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        } else {
            document.documentElement.classList.remove('light');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    };

    // Mendapatkan tema saat ini (prioritas: localStorage > preferensi sistem)
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = savedTheme ? savedTheme : (systemPrefersDark ? 'dark' : 'light');
    
    // Terapkan tema saat halaman dimuat
    applyTheme(currentTheme);

    // Tambahkan event listener ke tombol
    themeToggleBtn.addEventListener('click', () => {
        const newTheme = document.documentElement.classList.contains('light') ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });
};

// --- FUNGSI SIDEBAR TOGGLE (DIHAPUS) ---
// (Logika JavaScript untuk toggle sidebar dihapus, sekarang murni CSS)


// --- FUNGSI OTENTIKASI GLOBAL ---
onAuthStateChanged(auth, (user) => {
    const mainContainer = document.querySelector('.main-canvas');
    if (user) {
        // Tunda visibility agar layout CSS sempat dihitung
        setTimeout(() => {
            if (mainContainer) mainContainer.style.visibility = 'visible';
        }, 100); // 100ms delay
        
        const userPhotoEl = document.getElementById('user-photo-header');
        if (userPhotoEl) {
            userPhotoEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=161B22&color=E6EDF3`;
        }
        
    } else {
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }
});

const handleActiveNavLinks = () => {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        // Hapus trailing slash untuk perbandingan yang konsisten
        const linkPath = new URL(link.href).pathname.replace(/\/$/, '');
        const currentBasePath = currentPath.replace(/\/$/, '');
        
        // Tandai sebagai aktif jika path sama persis
        // atau jika di halaman utama ('/') dan linknya adalah '/dashboard'
        if (linkPath === currentBasePath || (currentBasePath === '' && linkPath.endsWith('/dashboard'))) {
            link.classList.add('active');
        }
    });
};

// --- INISIALISASI SAAT DOM SIAP ---
document.addEventListener('DOMContentLoaded', () => {
    handleActiveNavLinks();
    handleThemeToggle(); // Jalankan fungsi tema
    // (Panggilan ke handleSidebarToggle() sudah dihapus)

    // Logika untuk Modal Feedback
    const feedbackBtn = document.getElementById('feedback-btn');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeModalBtn = document.getElementById('close-feedback-modal-btn');
    const feedbackForm = document.getElementById('feedback-form');
    const successMessage = document.getElementById('feedback-success-message');
    const formContainer = document.getElementById('feedback-form-container');
    const modalContent = document.getElementById('feedback-modal-card');

    const openModal = () => {
        if (feedbackModal) {
            feedbackModal.classList.remove('hidden');
            setTimeout(() => modalContent.classList.remove('opacity-0', '-translate-y-4'), 10);
        }
    };

    const closeModal = () => {
        if (feedbackModal) {
            modalContent.classList.add('opacity-0', '-translate-y-4');
            setTimeout(() => {
                feedbackModal.classList.add('hidden');
                // Reset form untuk penggunaan selanjutnya
                if (formContainer && successMessage && feedbackForm) {
                    formContainer.classList.remove('hidden');
                    successMessage.classList.add('hidden');
                    feedbackForm.reset();
                }
            }, 300);
        }
    };

    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', openModal);
    }
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    if (feedbackModal) {
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) {
                closeModal();
            }
        });
    }

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-feedback-btn');
            const btnText = submitBtn.querySelector('.btn-text');
            const originalText = btnText.textContent;
            
            btnText.textContent = "Mengirim...";
            submitBtn.disabled = true;

            const formData = new FormData(this);
            const data = {
                category: formData.get('category'),
                message: formData.get('message'),
                pageUrl: window.location.pathname
            };

            fetch('/api/submit-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    formContainer.classList.add('hidden');
                    successMessage.classList.remove('hidden');
                } else {
                    alert('Gagal mengirim masukan: ' + data.message);
                }
            })
            .catch((error) => {
                console.error('Error:', error);
                alert('Terjadi kesalahan. Silakan coba lagi.');
            })
            .finally(() => {
                btnText.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
    }
});