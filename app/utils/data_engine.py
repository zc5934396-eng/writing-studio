# File: app/utils/data_engine.py
# Deskripsi: Engine Data Processing dengan HYBRID STORAGE (Cloud First, Local Fallback).
# Updated: Menangani error Cloud Storage dengan menyimpan data secara lokal.

import pandas as pd
import numpy as np
import json
import uuid
import io
import os
import traceback
from datetime import datetime
from firebase_admin import storage

# --- KONFIGURASI LOCAL STORAGE (PLAN B) ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
LOCAL_STORAGE_PATH = os.path.join(BASE_DIR, '../../instance/user_data')

if not os.path.exists(LOCAL_STORAGE_PATH):
    os.makedirs(LOCAL_STORAGE_PATH)

# --- Helper: Konversi Tipe Data Agresif ---
def safe_value(val):
    if pd.isna(val): return None
    if isinstance(val, (np.integer, int)): return int(val)
    if isinstance(val, (np.floating, float)):
        if np.isinf(val) or np.isnan(val): return None
        return float(val)
    if isinstance(val, np.bool_): return bool(val)
    return str(val)

class OnThesisVariableMetadata:
    def __init__(self, name, data_series=None, meta_dict=None):
        if meta_dict:
            self.from_dict(meta_dict)
        else:
            self.name = name
            self.label = ""
            self.type = "Numeric"
            self.measure = "scale"
            self.role = "input"
            self.missing_values = []
            self.width = 8
            self.decimals = 2
            self.align = "Right"
            self.value_labels = {}
            
            if data_series is not None:
                self.infer_metadata(data_series)

    def infer_metadata(self, series):
        # Logika deteksi tipe data sederhana
        if pd.api.types.is_numeric_dtype(series):
            self.type = "Numeric"
            self.measure = "scale"
            self.align = "Right"
        else:
            self.type = "String"
            self.measure = "nominal"
            self.decimals = 0
            self.align = "Left"
            
            # Heuristic: Jika string tapi uniknya sedikit (misal Gender: L/P), anggap Nominal
            if series.nunique() < 10 and len(series) > 20:
                self.measure = "nominal"

    def get_label(self): return self.label if self.label else self.name
    def get_measure_level(self): return self.measure
    def get_value_labels(self): return self.value_labels
    
    def to_dict(self):
        return {
            'name': self.name, 'label': self.label, 'type': self.type,
            'measure': self.measure, 'role': self.role, 'missing_values': self.missing_values,
            'width': self.width, 'decimals': self.decimals, 'align': self.align,
            'value_labels': self.value_labels
        }

    def from_dict(self, d):
        self.name = d.get('name')
        self.label = d.get('label', '')
        self.type = d.get('type', 'Numeric')
        self.measure = d.get('measure', 'scale')
        self.role = d.get('role', 'input')
        self.missing_values = d.get('missing_values', [])
        self.width = d.get('width', 8)
        self.decimals = d.get('decimals', 2)
        self.align = d.get('align', 'Right')
        self.value_labels = d.get('value_labels', {})

class SPSSDataset:
    def __init__(self, df=None, user_id=None, project_id='default'):
        self.user_id = str(user_id) if user_id else "guest"
        self.project_id = project_id
        self.df = df if df is not None else pd.DataFrame()
        self.meta = {}
        self.analysis_history = []
        
        # Path Cloud Storage (Virtual)
        self.blob_base_path = f"users/{self.user_id}/projects/{self.project_id}"
        self.data_blob_path = f"{self.blob_base_path}/data.csv"
        self.meta_blob_path = f"{self.blob_base_path}/meta.json"

        # Path Local Storage (Physical)
        self.local_dir = os.path.join(LOCAL_STORAGE_PATH, self.user_id, self.project_id)
        self.local_data_path = os.path.join(self.local_dir, "data.csv")
        self.local_meta_path = os.path.join(self.local_dir, "meta.json")

        if not self.df.empty: self.sync_metadata()

    def _get_bucket(self):
        return storage.bucket()

    def sync_metadata(self):
        current_cols = set(self.df.columns)
        self.meta = {k: v for k, v in self.meta.items() if k in current_cols}
        for col in self.df.columns:
            if col not in self.meta:
                self.meta[col] = OnThesisVariableMetadata(col, self.df[col])

    # --- SMART IMPORT LOGIC ---
    @staticmethod
    def smart_preview(file_storage, filename):
        try:
            if filename.endswith('.csv'):
                df_sample = pd.read_csv(file_storage, nrows=20, header=None, on_bad_lines='skip', engine='python')
            else:
                df_sample = pd.read_excel(file_storage, nrows=20, header=None)
            
            file_storage.seek(0)

            header_row_index = 0
            max_unique_strings = 0
            
            for i in range(min(5, len(df_sample))):
                row = df_sample.iloc[i]
                str_count = row.apply(lambda x: isinstance(x, str) and not str(x).replace('.','',1).isdigit()).sum()
                if str_count > max_unique_strings:
                    max_unique_strings = str_count
                    header_row_index = i
            
            if filename.endswith('.csv'):
                df = pd.read_csv(file_storage, header=header_row_index, nrows=10)
            else:
                df = pd.read_excel(file_storage, header=header_row_index, nrows=10)

            columns_meta = []
            for col in df.columns:
                col_name = str(col).strip()
                series = df[col]
                is_numeric = pd.api.types.is_numeric_dtype(series)
                measure = "scale" if is_numeric else "nominal"
                sample_values = series.head(3).apply(safe_value).tolist()
                
                columns_meta.append({
                    "name": col_name,
                    "detected_type": "Numeric" if is_numeric else "String",
                    "detected_measure": measure,
                    "sample": sample_values
                })

            return {
                "status": "success",
                "detected_header_row": header_row_index,
                "total_columns": len(df.columns),
                "columns": columns_meta,
                "preview_data": df.replace({np.nan: None}).values.tolist()
            }

        except Exception as e:
            print(f"Smart Preview Error: {e}")
            return {"status": "error", "message": str(e)}

    # --- HYBRID SAVE SYSTEM (CLOUD -> LOCAL FALLBACK) ---
    def save(self):
        """
        Mencoba simpan ke Cloud. Jika gagal, simpan ke Local Storage.
        """
        meta_export = {
            'variables': {k: v.to_dict() for k, v in self.meta.items()},
            'history': self.analysis_history,
            'updated_at': datetime.now().isoformat()
        }
        csv_buffer = io.StringIO()
        self.df.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()
        meta_content = json.dumps(meta_export, indent=2)

        # 1. Coba Cloud Storage
        try:
            bucket = self._get_bucket()
            bucket.blob(self.data_blob_path).upload_from_string(csv_content, content_type='text/csv')
            bucket.blob(self.meta_blob_path).upload_from_string(meta_content, content_type='application/json')
            print(f"✅ Saved to Cloud: {self.project_id}")
            return True, "Saved to Cloud"
        except Exception as e:
            print(f"⚠️ Cloud Save Failed ({e}). Falling back to Local Storage...")
            
            # 2. Fallback ke Local Storage
            try:
                if not os.path.exists(self.local_dir):
                    os.makedirs(self.local_dir)
                
                with open(self.local_data_path, 'w', encoding='utf-8') as f:
                    f.write(csv_content)
                
                with open(self.local_meta_path, 'w', encoding='utf-8') as f:
                    f.write(meta_content)
                
                print(f"✅ Saved Locally: {self.local_dir}")
                return True, "Saved Locally (Offline Mode)"
            except Exception as local_err:
                print(f"❌ Local Save Failed: {local_err}")
                return False, f"Critical Storage Error: {local_err}"

    # --- HYBRID LOAD SYSTEM ---
    @staticmethod
    def load(user_id, project_id='default'):
        instance = SPSSDataset(user_id=user_id, project_id=project_id)
        
        # 1. Coba Load dari Cloud
        try:
            bucket = instance._get_bucket()
            blob_data = bucket.blob(instance.data_blob_path)
            blob_meta = bucket.blob(instance.meta_blob_path)
            
            if blob_data.exists() and blob_meta.exists():
                instance.df = pd.read_csv(io.StringIO(blob_data.download_as_text()), low_memory=False)
                meta_data = json.loads(blob_meta.download_as_text())
                instance._parse_meta(meta_data)
                return instance
        except Exception as e:
            print(f"⚠️ Cloud Load Failed ({e}). Checking Local Storage...")

        # 2. Fallback Load dari Local
        try:
            if os.path.exists(instance.local_data_path) and os.path.exists(instance.local_meta_path):
                instance.df = pd.read_csv(instance.local_data_path, low_memory=False)
                with open(instance.local_meta_path, 'r', encoding='utf-8') as f:
                    meta_data = json.load(f)
                instance._parse_meta(meta_data)
                print(f"✅ Loaded from Local: {instance.project_id}")
                return instance
        except Exception as local_err:
            print(f"❌ Local Load Failed: {local_err}")
        
        return None

    def _parse_meta(self, meta_data):
        self.analysis_history = meta_data.get('history', [])
        vars_dict = meta_data.get('variables', {})
        for col_name, col_meta in vars_dict.items():
            if col_name in self.df.columns:
                self.meta[col_name] = OnThesisVariableMetadata(col_name, meta_dict=col_meta)
        self.sync_metadata()

    # --- DATA PREP LOGIC (Standard) ---
    def handle_missing_values(self, action, target_columns=None):
        cols = target_columns if target_columns and isinstance(target_columns, list) and len(target_columns) > 0 else self.df.columns.tolist()
        try:
            if action == 'drop_rows':
                before = len(self.df)
                self.df.dropna(subset=cols, inplace=True)
                self.df.reset_index(drop=True, inplace=True)
                msg = f"Dihapus {before - len(self.df)} baris."
            elif action == 'fill_mean':
                for col in cols:
                    if col in self.df.columns and pd.api.types.is_numeric_dtype(self.df[col]):
                        self.df[col] = self.df[col].fillna(self.df[col].mean())
                msg = "Nilai kosong diisi Mean."
            elif action == 'fill_median':
                for col in cols:
                    if col in self.df.columns and pd.api.types.is_numeric_dtype(self.df[col]):
                        self.df[col] = self.df[col].fillna(self.df[col].median())
                msg = "Nilai kosong diisi Median."
            elif action == 'fill_mode':
                for col in cols:
                    if col in self.df.columns:
                        mode_val = self.df[col].mode()
                        if not mode_val.empty: self.df[col] = self.df[col].fillna(mode_val[0])
                msg = "Nilai kosong diisi Modus."
            elif action == 'fill_zero':
                for col in cols:
                    if col in self.df.columns:
                        self.df[col] = self.df[col].fillna(0)
                msg = "Nilai kosong diisi 0."
            else:
                return False, "Aksi tidak dikenali."

            success, save_msg = self.save()
            if success: return True, msg
            else: return False, f"Gagal menyimpan: {save_msg}"
        except Exception as e: return False, str(e)

    def remove_duplicates(self, target_columns=None):
        try:
            initial_count = len(self.df)
            subset = target_columns if target_columns and len(target_columns) > 0 else None
            self.df.drop_duplicates(subset=subset, inplace=True)
            self.df.reset_index(drop=True, inplace=True)
            removed = initial_count - len(self.df)
            success, save_msg = self.save()
            if success: return True, f"Berhasil menghapus {removed} baris duplikat."
            else: return False, f"Gagal menyimpan: {save_msg}"
        except Exception as e: return False, str(e)

    def find_and_replace(self, find_text, replace_text, target_columns=None, exact_match=False):
        try:
            cols = target_columns if target_columns and len(target_columns) > 0 else self.df.columns.tolist()
            
            def try_convert(val):
                try: return float(val)
                except: return val
            
            find_val = try_convert(find_text)
            replace_val = try_convert(replace_text)
            
            for col in cols:
                if col not in self.df.columns: continue
                if exact_match:
                    self.df[col] = self.df[col].replace({find_text: replace_val, find_val: replace_val})
                else:
                    if pd.api.types.is_string_dtype(self.df[col]):
                        self.df[col] = self.df[col].astype(str).str.replace(str(find_text), str(replace_text), regex=False)
            
            success, save_msg = self.save()
            if success: return True, "Find & Replace berhasil."
            else: return False, f"Gagal menyimpan: {save_msg}"
        except Exception as e: return False, str(e)

    def scan_data_quality(self):
        try:
            report = { "total_rows": safe_value(len(self.df)), "total_cols": safe_value(len(self.df.columns)), "duplicates": safe_value(self.df.duplicated().sum()), "columns": [] }
            for col in self.df.columns:
                try:
                    series = self.df[col]
                    meta = self.meta.get(col)
                    missing = safe_value(series.isna().sum())
                    missing_pct = round((missing/len(self.df)*100),1) if len(self.df)>0 else 0
                    outliers = 0
                    is_num = pd.api.types.is_numeric_dtype(series)
                    if is_num and len(series.dropna()) > 10:
                        z = np.abs((series - series.mean()) / series.std())
                        outliers = safe_value(len(series[z > 3]))
                    col_type = meta.type if meta else ("Numeric" if is_num else "String")
                    col_report = { "name": str(col), "type": str(col_type), "missing": missing, "missing_pct": missing_pct, "unique": safe_value(series.nunique()), "outliers": outliers, "recommendations": [] }
                    if missing_pct > 0: col_report['recommendations'].append("Isi missing value." if missing_pct < 5 else "Hapus baris/imputasi.")
                    if outliers > 0: col_report['recommendations'].append(f"{outliers} outlier terdeteksi.")
                    report['columns'].append(col_report)
                except: continue
            return report
        except Exception as e: return {"error": str(e)}

    def get_analysis_dataframe(self, variables=None, drop_missing=True):
        target_vars = variables if variables else self.df.columns.tolist()
        clean_df = self.df[target_vars].copy()
        for col in target_vars:
            meta = self.meta.get(col)
            if meta and meta.type == 'Numeric':
                clean_df[col] = pd.to_numeric(clean_df[col], errors='coerce')
        if drop_missing: clean_df.dropna(inplace=True)
        return clean_df

    def update_cell_data(self, r, c, val):
        try:
            if r >= len(self.df): self.add_empty_row()
            col_name = self.df.columns[c]
            if val == '' or val is None: val = np.nan
            else:
                try:
                    if pd.api.types.is_numeric_dtype(self.df[col_name]):
                        val = float(val)
                        if val.is_integer(): val = int(val)
                except: pass
            if r < len(self.df): self.df.iat[r, c] = val
            else:
                new_row = {col: np.nan for col in self.df.columns}
                new_row[col_name] = val
                self.df = pd.concat([self.df, pd.DataFrame([new_row])], ignore_index=True)
            self.save()
            return True, "Success"
        except Exception as e: return False, str(e)

    def update_variable(self, old_name, field, value):
        if old_name not in self.meta: return False
        var_meta = self.meta[old_name]
        if field == 'name':
            if value in self.df.columns and value != old_name: return False
            self.df.rename(columns={old_name: value}, inplace=True)
            self.meta[value] = self.meta.pop(old_name)
            self.meta[value].name = value
        elif field == 'measure': var_meta.measure = value
        elif field == 'role': var_meta.role = value
        elif field == 'label': var_meta.label = value
        elif field == 'type': var_meta.type = value
        self.save()
        return True

    def add_empty_row(self):
        self.df = pd.concat([self.df, pd.DataFrame([{c:np.nan for c in self.df.columns}])], ignore_index=True)

    def add_analysis_log(self, analysis_type, result_data, params=None):
        try:
            log = { "id": str(uuid.uuid4()), "timestamp": datetime.now().isoformat(), "type": analysis_type, "result": result_data, "params": params or {} }
            self.analysis_history.insert(0, log)
            self.analysis_history = self.analysis_history[:20]
            self.save()
            return log
        except: return None

    def get_analysis_history(self): return self.analysis_history
    def delete_analysis_log(self, log_id):
        self.analysis_history = [l for l in self.analysis_history if l['id'] != log_id]
        self.save()
    def clear_analysis_history(self):
        self.analysis_history = []
        self.save()
    
    def get_variable_metadata(self, var_name): return self.meta.get(var_name)
    
    def search_data(self, query, target_columns=None):
        res = []
        cols = target_columns if target_columns else self.df.columns.tolist()
        q = str(query).lower()
        for c in cols:
            if c not in self.df.columns: continue
            col_idx = self.df.columns.get_loc(c)
            s = self.df[c].astype(str).str.lower()
            matches = self.df.index[s.str.contains(q, na=False, regex=False)].tolist()
            for r in matches:
                res.append({'row': r, 'col': col_idx, 'val': self.df.iat[r, col_idx]})
                if len(res) > 100: break
            if len(res) > 100: break
        return res

    def get_variable_view_data(self): return [self.meta[c].to_dict() for c in self.df.columns if c in self.meta]
    def get_data_view_data(self): return { "columns": list(self.df.columns), "data": self.df.replace({np.nan: None}).values.tolist() }
    def clear_all_data(self):
        self.df = pd.DataFrame(); self.meta = {}; self.analysis_history = []
        self.save()
        return True
    def export_to_csv(self):
        output = io.BytesIO()
        self.df.to_csv(output, index=False)
        output.seek(0)
        return output