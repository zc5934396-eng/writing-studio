# File: app/utils/stats_utils.py
import pandas as pd
import numpy as np
import pingouin as pg
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import durbin_watson
from statsmodels.stats.diagnostic import het_breuschpagan
from scipy import stats
import traceback

# --- HELPER: JSON CLEANER & FORMATTER ---
def _clean_for_json(data):
    """
    Recursively membersihkan data:
    1. Convert Numpy types (int64, bool_) ke Python native.
    2. ROUNDING otomatis ke 3 desimal untuk semua float.
    3. Ganti NaN/Infinity dengan None.
    """
    if isinstance(data, dict):
        return {k: _clean_for_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_clean_for_json(v) for v in data]
    elif isinstance(data, (np.integer, int)):
        return int(data)
    elif isinstance(data, (np.floating, float)):
        val = float(data)
        if np.isnan(val) or np.isinf(val): return None
        return round(val, 3) 
    elif isinstance(data, (np.bool_, bool)):
        return bool(data)
    elif isinstance(data, np.ndarray):
        return _clean_for_json(data.tolist())
    else:
        return data

def _format_p_value(p):
    if p is None or np.isnan(p): return "NaN"
    if p < 0.001: return "< .001"
    return f"{p:.3f}"

def _get_variable_label(dataset, var_name):
    meta = dataset.get_variable_metadata(var_name)
    if meta and meta.get_label(): return meta.get_label()
    return var_name

def _interpret_correlation(r):
    if r is None: return "-"
    abs_r = abs(r)
    if abs_r < 0.2: return "Sangat Lemah"
    if abs_r < 0.4: return "Lemah"
    if abs_r < 0.7: return "Sedang"
    if abs_r < 0.9: return "Kuat"
    return "Sangat Kuat"

# ==========================================
# 1. DESKRIPTIF & FREKUENSI
# ==========================================
def run_descriptive_analysis(dataset, variables):
    results = {}
    df = dataset.get_analysis_dataframe(variables, drop_missing=False)
    
    for var in variables:
        series = df[var].dropna()
        meta = dataset.get_variable_metadata(var)
        label = _get_variable_label(dataset, var)
        measure = meta.get_measure_level() if meta else 'scale'
        
        var_result = {
            "label": label, "n": len(series), "missing": len(df) - len(series), "type": measure
        }

        if series.empty:
            var_result['error'] = "Tidak ada data valid."
            results[var] = var_result
            continue

        if measure == 'scale':
            try:
                desc = series.describe().to_dict()
                var_result["stats"] = {
                    "mean": series.mean(), "median": series.median(), "std": series.std(),
                    "min": desc.get('min'), "max": desc.get('max'),
                    "skewness": series.skew(), "kurtosis": series.kurt()
                }
            except Exception as e: var_result['error'] = str(e)
        else:
            try:
                counts = series.value_counts().sort_index()
                percents = series.value_counts(normalize=True).sort_index() * 100
                table = []
                cum = 0
                labels_map = meta.get_value_labels() if meta else {}
                for val, freq in counts.items():
                    pct = percents[val]
                    cum += pct
                    val_key = int(val) if isinstance(val, (int, float)) and float(val).is_integer() else val
                    lbl = labels_map.get(val_key, str(val))
                    table.append({"value": val, "label": lbl, "freq": freq, "percent": pct, "cum_percent": cum})
                var_result["frequency_table"] = table
            except Exception as e: var_result['error'] = str(e)

        results[var] = var_result
    return _clean_for_json(results)

# ==========================================
# 2. UJI NORMALITAS
# ==========================================
def run_normality_test(dataset, variables):
    df = dataset.get_analysis_dataframe(variables)
    results = []
    for var in variables:
        series = df[var].dropna()
        label = _get_variable_label(dataset, var)
        if len(series) < 3:
            results.append({"variable": label, "error": "N < 3"})
            continue
        
        # Shapiro-Wilk (Standard)
        s_stat, s_p = stats.shapiro(series)
        
        # Kolmogorov-Smirnov (Lilliefors significance usually preferred, but basic here)
        k_stat, k_p = stats.kstest((series - series.mean()) / series.std(), 'norm')
        
        results.append({
            "label": label, "n": len(series),
            "shapiro": {"stat": s_stat, "sig": _format_p_value(s_p)},
            "ks": {"stat": k_stat, "sig": _format_p_value(k_p)},
            "normal": s_p > 0.05 # Menggunakan Shapiro sebagai acuan utama
        })
    return _clean_for_json(results)

# ==========================================
# 3. COMPARE MEANS
# ==========================================
def run_independent_ttest(dataset, group_var, test_vars):
    all_vars = [group_var] + test_vars
    df = dataset.get_analysis_dataframe(all_vars)
    groups = df[group_var].dropna().unique()
    if len(groups) != 2: raise ValueError(f"Grup harus 2 kategori. Ditemukan: {len(groups)}")
    g1, g2 = groups[0], groups[1]
    results = {}
    for var in test_vars:
        try:
            d1 = df[df[group_var] == g1][var].dropna()
            d2 = df[df[group_var] == g2][var].dropna()
            if len(d1) < 2 or len(d2) < 2:
                results[var] = {"error": "Data tidak cukup"}
                continue
            lev_stat, lev_p = stats.levene(d1, d2)
            equal_var = lev_p > 0.05
            res = pg.ttest(d1, d2, correction=not equal_var)
            results[var] = {
                "label": _get_variable_label(dataset, var),
                "levene": {"sig": _format_p_value(lev_p)},
                "t_stat": res['T'].values[0], "df": res['dof'].values[0], "sig": _format_p_value(res['p-val'].values[0]),
                "mean_diff": d1.mean() - d2.mean(),
                "group_stats": {str(g1): {"mean": d1.mean(), "n": len(d1)}, str(g2): {"mean": d2.mean(), "n": len(d2)}}
            }
        except Exception as e: results[var] = {"error": str(e)}
    return _clean_for_json(results)

def run_paired_ttest(dataset, var1, var2):
    list_v1 = [var1] if isinstance(var1, str) else var1
    list_v2 = [var2] if isinstance(var2, str) else var2
    results = []
    
    min_len = min(len(list_v1), len(list_v2))
    for i in range(min_len):
        v1, v2 = list_v1[i], list_v2[i]
        df = dataset.get_analysis_dataframe([v1, v2])
        try:
            res = pg.ttest(df[v1], df[v2], paired=True)
            results.append({
                "pair": f"{_get_variable_label(dataset, v1)} - {_get_variable_label(dataset, v2)}",
                "t_stat": res['T'].values[0],
                "df": res['dof'].values[0],
                "sig": _format_p_value(res['p-val'].values[0]),
                "mean_diff": df[v1].mean() - df[v2].mean(),
                "corr": df[v1].corr(df[v2])
            })
        except Exception as e:
            results.append({"pair": f"{v1} - {v2}", "error": str(e)})
    return _clean_for_json(results)

def run_oneway_anova(dataset, dependent_list, factor):
    deps = [dependent_list] if isinstance(dependent_list, str) else dependent_list
    results = {}
    for dv in deps:
        df = dataset.get_analysis_dataframe([dv, factor])
        try:
            aov = pg.anova(data=df, dv=dv, between=factor, detailed=True)
            desc = df.groupby(factor)[dv].describe().reset_index()
            posthoc = []
            if aov['p-unc'][0] < 0.05:
                ph = pg.pairwise_tukey(data=df, dv=dv, between=factor)
                posthoc = ph.to_dict('records')
            results[dv] = {
                "label": _get_variable_label(dataset, dv),
                "anova_table": aov.to_dict('records'),
                "descriptives": desc.to_dict('records'),
                "posthoc": posthoc
            }
        except Exception as e: results[dv] = {"error": str(e)}
    return _clean_for_json(results)

# ==========================================
# 4. KORELASI & REGRESI (SUPERCHARGED)
# ==========================================
def run_correlation(dataset, variables, method='pearson'):
    df = dataset.get_analysis_dataframe(variables)
    try:
        corr_df = pg.pairwise_corr(df, columns=variables, method=method)
        matrix = {v: {v2: {"r": 1, "p": "", "n": len(df)} if v==v2 else {} for v2 in variables} for v in variables}
        for _, row in corr_df.iterrows():
            X, Y = row['X'], row['Y']
            res = {"r": row['r'], "p": _format_p_value(row['p-unc']), "n": row['n'], "interp": _interpret_correlation(row['r'])}
            matrix[X][Y] = res; matrix[Y][X] = res
        return _clean_for_json({"matrix": matrix, "method": method})
    except Exception as e: raise ValueError(str(e))

def run_linear_regression(dataset, dependent, independents, **kwargs):
    """
    Menjalankan Regresi Linear Berganda + Uji Asumsi Klasik Otomatis.
    """
    cols = [dependent] + independents
    df = dataset.get_analysis_dataframe(cols)
    
    if df.empty or len(df) < len(independents) + 2:
        raise ValueError("Data tidak cukup untuk analisis regresi.")

    # 1. Model Regresi (OLS)
    X = df[independents]
    X = sm.add_constant(X) # Tambahkan konstanta (Intercept)
    y = df[dependent]
    
    try:
        model = sm.OLS(y, X).fit()
        
        # 2. Hitung Multikolinearitas (VIF)
        # VIF tidak dihitung untuk konstanta
        vif_data = []
        if len(independents) > 1:
            for i, col in enumerate(independents):
                # idx + 1 karena kolom 0 adalah const
                vif = variance_inflation_factor(X.values, i + 1)
                vif_data.append({"variable": col, "vif": vif})
        
        # 3. Uji Normalitas Residual
        resid = model.resid
        # Kolmogorov-Smirnov pada Residual
        ks_stat, ks_p = stats.kstest((resid - resid.mean())/resid.std(), 'norm')
        # Shapiro-Wilk pada Residual (Limitasi N < 5000)
        sh_stat, sh_p = stats.shapiro(resid) if len(resid) < 5000 else (None, None)
        
        # 4. Uji Heteroskedastisitas (Breusch-Pagan)
        # H0: Homoskedastisitas (Varian error konstan)
        # H1: Heteroskedastisitas
        lm_bp, p_bp, fval_bp, fp_bp = het_breuschpagan(resid, X)
        
        # 5. Uji Autokorelasi (Durbin-Watson)
        dw_val = durbin_watson(resid)
        
        # 6. Diagnostik Outlier (Cook's Distance)
        influence = model.get_influence()
        cooks_d = influence.cooks_distance[0]
        # Threshold umum: 4/n
        outlier_indices = np.where(cooks_d > (4/len(df)))[0].tolist()

        # Format Koefisien
        coefs = []
        for name, coef in model.params.items():
            # Cari nilai VIF yang cocok
            vif_val = next((item['vif'] for item in vif_data if item['variable'] == name), "-")
            coefs.append({
                "variable": name, "B": coef, "std_err": model.bse[name],
                "t": model.tvalues[name], "sig": _format_p_value(model.pvalues[name]),
                "vif": vif_val
            })

        # Susun Hasil Akhir
        return _clean_for_json({
            # Model Summary
            "r_square": model.rsquared,
            "adj_r_square": model.rsquared_adj,
            "f_val": model.fvalue,
            "sig_f": _format_p_value(model.f_pvalue),
            "coefficients": coefs,
            
            # Uji Asumsi Klasik
            "assumptions": {
                "normality": {
                    "ks": {"stat": ks_stat, "sig": _format_p_value(ks_p), "pass": ks_p > 0.05},
                    "shapiro": {"stat": sh_stat, "sig": _format_p_value(sh_p), "pass": (sh_p > 0.05) if sh_p else None},
                    "conclusion": "Normal" if (ks_p > 0.05) else "Tidak Normal"
                },
                "autocorrelation": {
                    "durbin_watson": dw_val,
                    "conclusion": "Tidak ada autokorelasi" if 1.5 < dw_val < 2.5 else "Ada autokorelasi/Ragu-ragu"
                },
                "heteroscedasticity": {
                    "breusch_pagan": {"f_val": fval_bp, "sig": _format_p_value(fp_bp)},
                    "conclusion": "Homoskedastisitas (Aman)" if fp_bp > 0.05 else "Terjadi Heteroskedastisitas"
                },
                "multicollinearity": {
                    "vif_data": vif_data,
                    "conclusion": "Bebas Multikolinearitas" if all(v['vif'] < 10 for v in vif_data) else "Ada Multikolinearitas"
                }
            },
            "diagnostics": {
                "outliers_detected": len(outlier_indices),
                "outlier_rows": outlier_indices
            }
        })
        
    except Exception as e:
        traceback.print_exc() 
        raise ValueError(str(e))

# ==========================================
# 5. NON-PARAMETRIK & LAINNYA
# ==========================================
def run_mann_whitney(dataset, group_var, test_vars):
    vars_list = [test_vars] if isinstance(test_vars, str) else test_vars
    df = dataset.get_analysis_dataframe([group_var] + vars_list)
    groups = df[group_var].unique()
    if len(groups) != 2: raise ValueError("Grup harus 2 kategori.")
    results = {}
    for var in vars_list:
        g1 = df[df[group_var] == groups[0]][var]
        g2 = df[df[group_var] == groups[1]][var]
        stat, p = stats.mannwhitneyu(g1, g2)
        results[var] = {"label": _get_variable_label(dataset, var), "u_stat": stat, "sig": _format_p_value(p)}
    return _clean_for_json(results)

def run_kruskal_wallis(dataset, group_var, test_vars):
    vars_list = [test_vars] if isinstance(test_vars, str) else test_vars
    df = dataset.get_analysis_dataframe([group_var] + vars_list)
    results = {}
    for var in vars_list:
        groups = [g[var].values for _, g in df.groupby(group_var)]
        stat, p = stats.kruskal(*groups)
        results[var] = {"label": _get_variable_label(dataset, var), "h_stat": stat, "sig": _format_p_value(p)}
    return _clean_for_json(results)

def run_wilcoxon(dataset, var1, var2):
    list_v1 = [var1] if isinstance(var1, str) else var1
    list_v2 = [var2] if isinstance(var2, str) else var2
    results = []
    min_len = min(len(list_v1), len(list_v2))
    for i in range(min_len):
        v1, v2 = list_v1[i], list_v2[i]
        df = dataset.get_analysis_dataframe([v1, v2])
        try:
            stat, p = stats.wilcoxon(df[v1], df[v2])
            results.append({"pair": f"{v1} - {v2}", "stat": stat, "sig": _format_p_value(p)})
        except Exception as e:
            results.append({"pair": f"{v1} - {v2}", "error": str(e)})
    return _clean_for_json(results)

def run_reliability_analysis(dataset, items):
    df = dataset.get_analysis_dataframe(items)
    try:
        alpha = pg.cronbach_alpha(data=df)[0]
        item_stats = []
        total_score = df.sum(axis=1)
        for col in items:
            corrected = total_score - df[col]
            r_it, _ = stats.pearsonr(df[col], corrected)
            alpha_del = pg.cronbach_alpha(data=df.drop(columns=[col]))[0]
            item_stats.append({
                "item": _get_variable_label(dataset, col), "citc": r_it, "alpha_if_deleted": alpha_del
            })
        return _clean_for_json({
            "cronbach_alpha": alpha, "n_items": len(items), "items": item_stats,
            "conclusion": "Reliabel" if alpha > 0.6 else "Tidak Reliabel"
        })
    except Exception as e: raise ValueError(str(e))

def run_validity_analysis(dataset, items):
    df = dataset.get_analysis_dataframe(items)
    total = df.sum(axis=1)
    n = len(df)
    t_crit = stats.t.ppf(0.975, df=n-2)
    r_tabel = np.sqrt(t_crit**2 / ((n-2) + t_crit**2))
    results = []
    for col in items:
        r_hit, p = stats.pearsonr(df[col], total)
        results.append({
            "item": _get_variable_label(dataset, col), "r_hitung": r_hit, "r_tabel": r_tabel, "sig": _format_p_value(p), "valid": r_hit > r_tabel
        })
    return _clean_for_json({"r_tabel": r_tabel, "items": results})

def run_chi_square(dataset, row_var, col_var):
    df = dataset.get_analysis_dataframe([row_var, col_var], drop_missing=True)
    crosstab = pd.crosstab(df[row_var], df[col_var])
    chi2, p, dof, ex = stats.chi2_contingency(crosstab)
    return _clean_for_json({
        "crosstab": crosstab.to_dict(), "chi2": chi2, "df": dof, "sig": _format_p_value(p)
    })