import os
import json
import glob
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import sys

# Define target log directory explicitly or pick latest
BASE_SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_BASE = os.path.join(BASE_SCRIPT_DIR, "logs")

def get_latest_experiment_dir():
    # Find all experiment directories
    dirs = glob.glob(os.path.join(LOG_BASE, "experiment_*"))
    if not dirs:
        print(f"No experiment directories found in {LOG_BASE}")
        sys.exit(1)
    # Sort by name (which includes timestamp) to get newest
    dirs.sort()
    return dirs[-1]

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

# ---------------------------------------------------------
# DATA PARSING
# ---------------------------------------------------------

def load_jsonl(file_path):
    data = []
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            for line in f:
                if line.strip():
                    try:
                        data.append(json.loads(line))
                    except:
                        pass
    return data

def parse_read_stress(exp_dir):
    path = os.path.join(exp_dir, "read_stress", "*", "metrics.jsonl")
    records = []
    
    for file in glob.glob(path):
        # Extract C and R from parent directory name (e.g., C10_R500)
        parent_dir = os.path.basename(os.path.dirname(file))
        parts = parent_dir.split("_")
        c = int(parts[0][1:])
        r = int(parts[1][1:])
        
        data = load_jsonl(file)
        if not data: continue
        
        df = pd.DataFrame(data)
        
        # Calculate derived metrics
        success_df = df[df.get('status', 200) < 400]
        error_df = df[df.get('status', 200) >= 400]
        
        total = len(df)
        errors = len(error_df)
        successes = len(success_df)
        
        # Throughput
        if total > 0:
            start_ts = df['timestamp'].min()
            end_ts = df['timestamp'].max()
            duration_sec = max(0.01, (end_ts - start_ts) / 1000.0)
            throughput = total / duration_sec
        else:
            throughput = 0
            
        avg_lat = success_df['latency'].mean() if len(success_df) > 0 else 0
        p95_lat = success_df['latency'].quantile(0.95) if len(success_df) > 0 else 0
        p99_lat = success_df['latency'].quantile(0.99) if len(success_df) > 0 else 0
        
        records.append({
            'Concurrency': c,
            'Requests': r,
            'Total': total,
            'Success': successes,
            'Errors': errors,
            'Error_Rate': (errors / total) * 100 if total > 0 else 0,
            'Throughput': throughput,
            'Avg_Latency': avg_lat,
            'P95_Latency': p95_lat,
            'P99_Latency': p99_lat
        })
        
    return pd.DataFrame(records)

def parse_mixed_load(exp_dir):
    path = os.path.join(exp_dir, "mixed_load", "*", "metrics.jsonl")
    records = []
    
    for file in glob.glob(path):
        parent_dir = os.path.basename(os.path.dirname(file))
        parts = parent_dir.split("_")
        c = int(parts[0][1:])
        r = int(parts[1][1:])
        
        data = load_jsonl(file)
        if not data: continue
        
        df = pd.DataFrame(data)
        
        for type_label in ['read', 'write']:
            type_df = df[df['type'] == type_label] if 'type' in df.columns else pd.DataFrame()
            total = len(type_df)
            
            if total > 0:
                success_df = type_df[type_df.get('status', 200) < 400]
                errors = len(type_df[type_df.get('status', 200) >= 400])
                
                start_ts = type_df['timestamp'].min()
                end_ts = type_df['timestamp'].max()
                duration_sec = max(0.01, (end_ts - start_ts) / 1000.0)
                throughput = total / duration_sec
                
                avg_lat = success_df['latency'].mean() if len(success_df) > 0 else 0
                
                records.append({
                    'Concurrency': c,
                    'Requests': r,
                    'Type': type_label,
                    'Throughput': throughput,
                    'Avg_Latency': avg_lat,
                    'Errors': errors
                })
                
    return pd.DataFrame(records)

def parse_write_race(exp_dir):
    path = os.path.join(exp_dir, "write_race", "*", "metrics.jsonl")
    records = []
    
    for file in glob.glob(path):
        data = load_jsonl(file)
        if not data: continue
        
        # Race log is a single summary per run usually
        for entry in data:
            records.append({
                'Capacity': entry.get('capacity', 0),
                'Requested': entry.get('requested', 0),
                'Successful': entry.get('successful', 0),
                'Blocked': entry.get('blocked', 0),
                # Over allocation is bad!
                'Integrity_Violation': entry.get('successful', 0) > entry.get('capacity', 0)
            })
            
    return pd.DataFrame(records)

def parse_failure_sim(exp_dir):
    file = os.path.join(exp_dir, "failure_sim", "metrics.jsonl")
    data = load_jsonl(file)
    if not data: return pd.DataFrame()
    return pd.DataFrame(data)


# ---------------------------------------------------------
# VISUALIZATION
# ---------------------------------------------------------
def generate_plots(exp_dir, plots_dir):
    sns.set_theme(style="whitegrid", palette="muted")
    
    # 1. READ STRESS PLOTS
    df_read = parse_read_stress(exp_dir)
    print(f"Read Stress Rows: {len(df_read)}")
    if not df_read.empty:
        # Group by concurrency and average out requests for simple plots
        agg_c = df_read.groupby('Concurrency').mean().reset_index()
        
        # A. Concurrency vs Latency
        plt.figure(figsize=(10, 6))
        plt.plot(agg_c['Concurrency'], agg_c['Avg_Latency'], marker='o', label='Avg Latency')
        plt.plot(agg_c['Concurrency'], agg_c['P95_Latency'], marker='s', label='P95 Latency', linestyle='--')
        plt.title('Read Stress: Concurrency vs Latency')
        plt.xlabel('Concurrency (Workers)')
        plt.ylabel('Latency (ms)')
        plt.legend()
        plt.grid(True)
        plt.savefig(os.path.join(plots_dir, 'read_latency_vs_concurrency.png'), dpi=300, bbox_inches='tight')
        plt.close()
        
        # B. Concurrency vs Throughput
        plt.figure(figsize=(10, 6))
        plt.bar(agg_c['Concurrency'].astype(str), agg_c['Throughput'], color='teal')
        plt.title('Read Stress: Concurrency vs Throughput')
        plt.xlabel('Concurrency (Workers)')
        plt.ylabel('Throughput (Requests / Second)')
        plt.grid(True, axis='y')
        plt.savefig(os.path.join(plots_dir, 'read_throughput_vs_concurrency.png'), dpi=300, bbox_inches='tight')
        plt.close()
        
        # C. Error Rate Heatmap
        # Pivot table for Requests vs Concurrency
        if len(df_read['Requests'].unique()) > 1 and len(df_read['Concurrency'].unique()) > 1:
            pivot_err = df_read.pivot_table(index='Requests', columns='Concurrency', values='Error_Rate')
            plt.figure(figsize=(8, 6))
            sns.heatmap(pivot_err, annot=True, cmap='Reds', fmt='.1f')
            plt.title('Error Rate (%) vs Load Variables')
            plt.savefig(os.path.join(plots_dir, 'read_error_heatmap.png'), dpi=300, bbox_inches='tight')
            plt.close()

    # 2. MIXED LOAD PLOTS
    df_mixed = parse_mixed_load(exp_dir)
    print(f"Mixed Load Rows: {len(df_mixed)}")
    if not df_mixed.empty:
        # A. Read vs Write Latency Comparison
        plt.figure(figsize=(10, 6))
        sns.barplot(data=df_mixed, x='Concurrency', y='Avg_Latency', hue='Type')
        plt.title('Mixed Workload: Read vs Write Avg Latency (WAL Interleaving)')
        plt.xlabel('Global Concurrency')
        plt.ylabel('Average Latency (ms)')
        plt.savefig(os.path.join(plots_dir, 'mixed_latency_comparison.png'), dpi=300, bbox_inches='tight')
        plt.close()
        
        # B. Mixed Errors
        agg_err = df_mixed.groupby('Concurrency')['Errors'].sum().reset_index()
        plt.figure(figsize=(8, 5))
        plt.plot(agg_err['Concurrency'], agg_err['Errors'], marker='x', color='red', linestyle='-.')
        plt.title('Unified Stress: Total Degradation (Errors) vs Concurrency')
        plt.xlabel('Global Concurrency')
        plt.ylabel('Total HTTP Errors')
        plt.grid(True)
        plt.savefig(os.path.join(plots_dir, 'mixed_errors_vs_concurrency.png'), dpi=300, bbox_inches='tight')
        plt.close()

    # 3. WRITE RACE PLOTS
    df_race = parse_write_race(exp_dir)
    print(f"Write Race Rows: {len(df_race)}")
    if not df_race.empty:
        # Success vs Blocked Stacked Bar
        agg_race = df_race.groupby(['Requested', 'Capacity']).first().reset_index()
        
        # Create a string label for the x-axis
        agg_race['Scenario'] = "Cap:" + agg_race['Capacity'].astype(str) + " / Req:" + agg_race['Requested'].astype(str)
        
        plt.figure(figsize=(10, 6))
        plt.bar(agg_race['Scenario'], agg_race['Successful'], label='Successful (Allocated)', color='#2ca02c')
        plt.bar(agg_race['Scenario'], agg_race['Blocked'], bottom=agg_race['Successful'], label='Blocked (Atomic Lock)', color='#d62728')
        
        # Draw capacity line
        for i, row in agg_race.iterrows():
            plt.hlines(row['Capacity'], i-0.4, i+0.4, colors='black', linestyles='solid', linewidth=2)
            
        plt.title('Race Condition Testing: Allocation Success vs Atomic Blocks')
        plt.ylabel('Number of Requests')
        plt.xticks(rotation=45)
        plt.legend()
        plt.tight_layout()
        plt.savefig(os.path.join(plots_dir, 'race_condition_blocks.png'), dpi=300, bbox_inches='tight')
        plt.close()

    # 4. FAILURE SIMULATION PLOTS
    df_fail = parse_failure_sim(exp_dir)
    print(f"Failure Sim Rows: {len(df_fail)}")
    if not df_fail.empty:
        success_count = df_fail['success'].sum()
        fail_count = len(df_fail) - success_count
        
        plt.figure(figsize=(6, 6))
        plt.pie([success_count, fail_count], labels=['Clean Rollback\n(Success)', 'Data Corruption\n(Failure)'], 
                colors=['#2ca02c', '#d62728'], autopct='%1.1f%%', startangle=90)
        plt.title('Atomicity Verification: Forced Process Termination')
        plt.savefig(os.path.join(plots_dir, 'failure_recovery_pie.png'), dpi=300, bbox_inches='tight')
        plt.close()

if __name__ == "__main__":
    exp_dir = get_latest_experiment_dir()
    print(f"Analyzing experiment data from: {exp_dir}")
    
    plots_dir = os.path.join(exp_dir, "plots")
    ensure_dir(plots_dir)
    
    # Needs to be called explicitly
    generate_plots(exp_dir, plots_dir)
    print(f"Generated plots saved to: {plots_dir}")
