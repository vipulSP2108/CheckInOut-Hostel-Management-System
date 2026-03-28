import os
import subprocess
import datetime
import json
import time

# --- CONFIGURATION ---
BASE_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TIMESTAMP = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
BASE_LOG_DIR = os.path.join(BASE_SCRIPT_DIR, "logs", f"experiment_{TIMESTAMP}")

CONCURRENCY_LEVELS = [10, 50, 100, 200, 400]
REQUEST_LEVELS = [500, 1000, 2000]

# For race test
CAPACITIES = [1, 2, 4]
STUDENTS = [5, 10, 20]

# For failure simulation
FAILURE_RUNS = 10

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def run_node_script(script_name, env_vars, step_name):
    script_path = os.path.join(BASE_SCRIPT_DIR, script_name)
    
    # Merge current environment with new vars
    env = os.environ.copy()
    for k, v in env_vars.items():
        env[k] = str(v)
        
    print(f"\n[{datetime.datetime.now().strftime('%H:%M:%S')}] RUNNING: {step_name} ({script_name})")
    print(f"   Parameters: {env_vars}")
    
    start_time = time.time()
    
    # Execute the node script
    try:
        result = subprocess.run(
            ["node", script_path],
            env=env,
            capture_output=True,
            text=True,
            check=False # We handle errors manually
        )
        
        duration = time.time() - start_time
        if result.returncode != 0:
            print(f"   [!] Script exited with code {result.returncode}")
            # print(result.stderr) # Uncomment for debugging
            
        print(f"   Completed in {duration:.2f}s")
        return result.returncode == 0
        
    except Exception as e:
        print(f"   [!] Exception running script: {e}")
        return False

def main():
    print(f"=== STARTING AUTOMATED EXPERIMENTATION SUITE ===")
    print(f"Log Directory: {BASE_LOG_DIR}")
    ensure_dir(BASE_LOG_DIR)
    
    # 1. READ STRESS TESTING (concurrent-usage.cjs)
    print("\n\n=== PHASE 1: READ STRESS (Gate Scans) ===")
    for c in CONCURRENCY_LEVELS:
        for r in REQUEST_LEVELS:
            # We want total requests to at least match concurrency
            if r < c: continue
                
            config_name = f"C{c}_R{r}"
            log_dir = os.path.join(BASE_LOG_DIR, "read_stress", config_name)
            ensure_dir(log_dir)
            
            env_vars = {
                "CONCURRENCY": c,
                "TOTAL_REQUESTS": r,
                "METRICS_FILE": os.path.join(log_dir, "metrics.jsonl")
            }
            run_node_script("concurrent-usage.cjs", env_vars, f"Read Stress {config_name}")
            
    # 2. MIXED LOAD TESTING (unified-stress-test.cjs)
    print("\n\n=== PHASE 2: MIXED LOAD (Unified Suite) ===")
    # For mixed load, we might use slightly lower numbers to avoid total OS socket exhaustion
    # since it runs 5 scenarios in parallel.
    for c in [10, 50, 100]:
        for r in [100, 500, 1000]:
            if r < c: continue
            
            config_name = f"C{c}_R{r}"
            log_dir = os.path.join(BASE_LOG_DIR, "mixed_load", config_name)
            ensure_dir(log_dir)
            
            env_vars = {
                "CONCURRENCY": c,
                "TOTAL_REQUESTS": r,
                "METRICS_FILE": os.path.join(log_dir, "metrics.jsonl")
            }
            run_node_script("unified-stress-test.cjs", env_vars, f"Mixed Load {config_name}")

    # 3. ATOMIC WRITE CApacity / RACE TESTING (race-test.cjs)
    print("\n\n=== PHASE 3: WRITE RACE CONDITIONS ===")
    for cap in CAPACITIES:
        for st in STUDENTS:
            if st <= cap: continue # We need more students than capacity to test race conditions
            
            config_name = f"CAP{cap}_STU{st}"
            log_dir = os.path.join(BASE_LOG_DIR, "write_race", config_name)
            ensure_dir(log_dir)
            
            env_vars = {
                "TARGET_CAPACITY": cap,
                "NUM_STUDENTS": st,
                "METRICS_FILE": os.path.join(log_dir, "metrics.jsonl")
            }
            run_node_script("race-test.cjs", env_vars, f"Race Test {config_name}")

    # 4. FAILURE TESTING (failure-simulation.cjs)
    print("\n\n=== PHASE 4: FAILURE RESILIENCE ===")
    log_dir = os.path.join(BASE_LOG_DIR, "failure_sim")
    ensure_dir(log_dir)
    
    for i in range(FAILURE_RUNS):
        env_vars = {
            "METRICS_FILE": os.path.join(log_dir, "metrics.jsonl")
        }
        run_node_script("failure-simulation.cjs", env_vars, f"Failure Sim Trial {i+1}/{FAILURE_RUNS}")

    print(f"\n\n=== EXPERIMENTATION SUITE COMPLETE ===")
    print(f"Results saved to: {BASE_LOG_DIR}")
    print("Run plot_metrics.py to analyze the results.")

if __name__ == "__main__":
    main()
