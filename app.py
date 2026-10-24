"""
Deepfake Detection and Media Verification System - Flask Web Application.
Provides RESTful APIs for media upload, neural forensic analysis, verification history,
downloadable authenticity certificates, and platform statistics.
"""

import os
import json
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
import database as db
import detector

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'mp4', 'avi', 'mov', 'webm'}

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB max upload

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize SQLite database with tables & initial seeds
try:
    db.init_db()
except Exception as e:
    print(f"[Database Error] {e}")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Render the main landing page with interactive verification studio."""
    stats = db.get_stats()
    recent = db.get_recent_verifications(limit=6)
    return render_template('index.html', stats=stats, recent=recent)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Return aggregated platform metrics."""
    return jsonify(db.get_stats())

@app.route('/api/history', methods=['GET'])
def get_history():
    """Return recent verification scans from database."""
    history = db.get_recent_verifications(limit=10)
    return jsonify({'success': True, 'records': history})

@app.route('/api/detect', methods=['POST'])
def detect_media():
    """
    Core detection endpoint.
    Accepts file upload or sample name, performs multi-layered forensic inspection,
    and returns comprehensive detection verdict and metrics.
    """
    model_type = request.form.get('model_type', 'ensemble')
    
    # Check if a sample file was requested instead of a new upload
    sample_name = request.form.get('sample_name')
    if sample_name:
        sample_path = os.path.join(BASE_DIR, 'static', 'images', secure_filename(sample_name))
        if os.path.exists(sample_path):
            with open(sample_path, 'rb') as f:
                file_bytes = f.read()
            filename = sample_name
            file_type = 'image/jpeg'
        else:
            return jsonify({'success': False, 'error': f'Sample file {sample_name} not found'}), 404
    else:
        if 'media' not in request.files:
            return jsonify({'success': False, 'error': 'No media file provided in request'}), 400
        
        file = request.files['media']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Unsupported file format. Supported: JPG, PNG, WEBP, MP4, AVI, MOV, WEBM'}), 400

        filename = secure_filename(file.filename)
        file_bytes = file.read()
        file_type = file.content_type or 'application/octet-stream'
        
        # Save uploaded file
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(save_path, 'wb') as f:
            f.write(file_bytes)

    # Perform forensic detection
    result = detector.analyze_media(file_bytes, filename, file_type, model_type)
    
    # Persist in SQLite database
    db.save_verification(result)
    
    return jsonify({
        'success': True,
        'data': result
    })

@app.route('/api/report/<tracking_id>', methods=['GET'])
def get_report(tracking_id):
    """Retrieve full verification certificate details by tracking ID."""
    record = db.get_verification_by_id(tracking_id)
    if not record:
        return jsonify({'success': False, 'error': 'Verification record not found'}), 404
    return jsonify({'success': True, 'report': record})

@app.route('/api/newsletter', methods=['POST'])
def subscribe_newsletter():
    """Subscribe user to threat intelligence and model update bulletins."""
    data = request.get_json() or {}
    email = data.get('email', '').strip()
    if not email or '@' not in email:
        return jsonify({'success': False, 'error': 'Valid email address required'}), 400
    
    success = db.add_subscriber(email)
    return jsonify({'success': success, 'message': 'Thank you for subscribing to DFD Model threat bulletins.'})

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """Submit rating or accuracy feedback on a verification scan."""
    data = request.get_json() or {}
    tracking_id = data.get('tracking_id')
    rating = int(data.get('rating', 5))
    comments = data.get('comments', '')
    
    conn = db.get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO feedback (verification_id, user_rating, comments)
        VALUES (?, ?, ?)
    ''', (tracking_id, rating, comments))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Feedback successfully received.'})

@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    """Register a new user account."""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({'success': False, 'error': 'Name, email, and password are required.'}), 400
    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters.'}), 400

    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    res = db.register_user(name, email, pw_hash)
    status_code = 200 if res['success'] else 400
    return jsonify(res), status_code

@app.route('/api/auth/signin', methods=['POST'])
def auth_signin():
    """Sign in existing user."""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required.'}), 400

    import hashlib
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    res = db.authenticate_user(email, pw_hash)
    status_code = 200 if res['success'] else 401
    return jsonify(res), status_code

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("[DFD Model Server] Starting Flask server on http://127.0.0.1:5000 ...")
    app.run(host='127.0.0.1', port=5000, debug=True)
