import { toast } from 'react-hot-toast';

export const UPGRADE_EVENT = 'TRIGGER_UPGRADE_MODAL';
const BASE_URL = ''; 

class ApiClient {
    async request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const headers = {
            ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
        };
        const config = { ...options, headers, credentials: 'include' };

        try {
            const response = await fetch(url, config);

            // INTERCEPTOR 403 (Limit)
            if (response.status === 403) {
                const clonedResponse = response.clone();
                const data = await clonedResponse.json().catch(() => ({}));
                if (data.error === 'LIMIT_REACHED') {
                    if (typeof window !== 'undefined') {
                        const event = new CustomEvent(UPGRADE_EVENT, { detail: data.message });
                        window.dispatchEvent(event);
                    }
                    throw new Error(data.message || 'Limit Reached');
                }
            }

            if (response.status === 401) {
                window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
                return null;
            }

            let data;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                const textErr = await response.text();
                if (!response.ok) throw new Error(textErr || `Server Error: ${response.status}`);
                data = textErr; 
            }

            if (!response.ok || (data && typeof data === 'object' && data.status === 'error')) {
                const msg = data?.message || data?.error || `Request Gagal (${response.status})`;
                throw new Error(msg);
            }

            return data;
        } catch (error) {
            console.error(`[API Error] ${endpoint}:`, error);
            if (!options.silent && error.message !== 'Limit Reached') {
                toast.error(error.message || "Gagal menghubungi server.", { id: 'api-error' });
            }
            throw error;
        }
    }

    get(endpoint, headers = {}) { return this.request(endpoint, { method: 'GET', headers }); }
    post(endpoint, body, headers = {}) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(body), headers }); }
    put(endpoint, body, headers = {}) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body), headers }); }
    delete(endpoint, body, headers = {}) { return this.request(endpoint, { method: 'DELETE', body: JSON.stringify(body), headers }); }
    upload(endpoint, formData) { return this.request(endpoint, { method: 'POST', body: formData }); }
}

export const api = new ApiClient();
export default api;