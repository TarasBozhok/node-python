import pickle
import json
import pandas as pd
import sys
import os
from datetime import datetime

samaple_req = '{"events":[{"timestamp":"1740410051376","action_type":"page_view","page_name":"Customer Behavior Demo"},{"timestamp":"1740410062185","action_type":"page_view","page_name":"30 French Cocktail Blini - France | Real Gourmet Food"},{"timestamp":"1740410068590","action_type":"click"},{"timestamp":"1740410073544","action_type":"scroll"},{"timestamp":"1740410074645","action_type":"scroll"}]}'

# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))

model_path = os.path.join(script_dir, 'random_forest_model.pkl')
sample_path = os.path.join(script_dir, 'X_test_sample_data.json')

with open(model_path, 'rb') as f:
    model = pickle.load(f)

with open(sample_path, 'rb') as f:
    sample_data = json.load(f)

X_test = pd.DataFrame([sample_data])
X_test_titles_only = X_test.loc[:, X_test.columns.str.startswith('event_params.page_title_')]

# Send message to Nodejs process to start server
print("INITIALIZED")
sys.stdout.flush()
# Disable output buffering
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1)

def generate_test_data(session_data):
    # Step 1: Initialize the DataFrame based on the sample data
    X_test = pd.DataFrame([sample_data])

    # Step 2: Set all columns with starting values
    for col in X_test.columns:
        prefixes = ('event_hour_', 'event_day_of_week_', 'event_month_')
        if col.startswith('event_params.page_title_'):
            X_test[col] = False
        if any(col.startswith(prefix) for prefix in prefixes[1:]):
            X_test[col] = 0

    # Step 3: Set default True for specific columns
    default_true_columns = [
        'event_name_first_visit',
        'event_name_session_start',
        'event_name_user_engagement'
    ]
    for col in default_true_columns:
        if col in X_test.columns:
            X_test[col] = 1

    # Step 4: Update DataFrame based on session events
    if 'events' in session_data:
        for event in session_data['events']:
            timestamp = int(event['timestamp']) / 1000
            dt_object = datetime.fromtimestamp(timestamp)
            event_name = f"event_name_{event['action_type']}"
            hour_name = f"event_hour_{dt_object.hour}"
            day_name = f"event_day_of_week_{dt_object.weekday() + 1}"
            month_name = f"event_month_{dt_object.month}"

            increment_column_names = [event_name, hour_name, day_name, month_name]

            for col_to_increment in increment_column_names:
                if col_to_increment in X_test.columns:
                    X_test[col_to_increment] += 1

            if 'page_name' in event:
                page_title = f"event_params.page_title_{event['page_name']}"
                try:
                    matching_column = next(col for col in X_test_titles_only.columns if col.startswith(page_title))
                    X_test[matching_column] += 1   
                except:
                    pass  
    else:
        sys.stderr.write('No events found in session_data')
        sys.stderr.flush()

    return X_test

#X_test = generate_test_data(json.loads(samaple_req))

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            print("stdin closed, exiting...")
            break

        data = json.loads(line.strip())

        if 'events' not in data:
            sys.stderr.write("Missing 'events' key in message")
            sys.stderr.flush()
            continue
            
        events = data['events']
        if not isinstance(events, list) or len(events) == 0:
            sys.stderr.write("'events' must be a non-empty array")
            sys.stderr.flush()
            continue

        X_test = generate_test_data(data)

        predictions = model.predict(X_test)

        # Map prediction [False] -> "No" and [True] -> "Yes"
        recommendation = "Yes" if predictions[0] else "No"
        
        # Send response back to Nodejs
        print(recommendation)
        sys.stdout.flush()
        
    except KeyboardInterrupt:
        break
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.stderr.flush()
