#!/usr/bin/env python3
"""Durable OCTAGON-FIT mail queue. Python standard library only."""
import base64
import hashlib
import json
import logging
import os
import re
import smtplib
import sqlite3
import ssl
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.umask(0o077)
for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())
PORT = int(os.environ.get('PORT', '8792'))
DB = ROOT / 'leads.sqlite3'
JOURNAL = ROOT / 'leads.jsonl'
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.mail.ru')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')
MAIL_TO = os.environ.get('MAIL_TO', 'octagon.fit@yandex.ru')
ORIGINS = set(os.environ.get('ALLOWED_ORIGINS', 'https://octagon-fit.ru').split(','))
MSK = timezone(timedelta(hours=3))
RATE_LOCK = threading.Lock()
JOURNAL_LOCK = threading.Lock()
DELIVERY_LOCK = threading.Lock()
HITS = defaultdict(deque)
WAKE = threading.Event()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
LABELS = {'type': 'Тип заявки', 'name': 'Имя', 'phone': 'Телефон',
          'trainer': 'Тренер', 'when': 'Когда удобно', 'source': 'Источник',
          'page': 'Страница', 'url': 'Адрес', 'consent': 'Согласие'}


def connection():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connection() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('''CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY, received TEXT NOT NULL, payload TEXT NOT NULL,
            fingerprint TEXT NOT NULL, created REAL NOT NULL, mail_sent_at TEXT,
            attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0,
            last_error TEXT)''')


def write_event(event):
    try:
        with JOURNAL_LOCK, JOURNAL.open('a', encoding='utf-8') as f:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')
    except OSError:
        logging.exception('Journal write failed; primary record remains in SQLite')


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Некорректный запрос')
    phone = re.sub(r'\D', '', str(data.get('phone', '')))
    if not re.fullmatch(r'[78]\d{10}', phone):
        raise ValueError('Проверьте номер телефона')
    if data.get('consent') != 'да':
        raise ValueError('Нет согласия на обработку данных')
    payload = {key: str(data.get(key) or '').strip()[:1000] for key in LABELS}
    payload['phone'] = '7' + phone[1:]
    # Promo forms intentionally request only a phone number.
    if data.get('resume') is not None:
        resume = data['resume']
        if not isinstance(resume, dict):
            raise ValueError('Некорректное резюме')
        try:
            raw = base64.b64decode(resume.get('data', ''), validate=True)
        except (ValueError, TypeError):
            raise ValueError('Некорректное резюме')
        if not raw or len(raw) > 5 * 1024 * 1024:
            raise ValueError('Резюме должно быть не больше 5 МБ')
        name = re.sub(r'[\r\n/\\]', '_', str(resume.get('name') or 'resume'))[:120]
        payload['resume'] = {'name': name, 'data': base64.b64encode(raw).decode()}
    return payload


def accept(payload):
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    fingerprint = hashlib.sha256(encoded.encode()).hexdigest()
    now = time.time()
    received = datetime.now(MSK).isoformat(timespec='seconds')
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        duplicate = db.execute('SELECT id FROM leads WHERE fingerprint=? AND created>?',
                               (fingerprint, now - 120)).fetchone()
        if duplicate:
            return duplicate['id']
        lead_id = uuid.uuid4().hex
        db.execute('INSERT INTO leads (id, received, payload, fingerprint, created) VALUES (?,?,?,?,?)',
                   (lead_id, received, encoded, fingerprint, now))
    journal_payload = dict(payload)
    if 'resume' in journal_payload:
        journal_payload['resume'] = journal_payload['resume']['name']
    write_event({'event': 'accepted', 'id': lead_id, 'received': received, **journal_payload})
    logging.info('%s accepted', lead_id)
    WAKE.set()
    return lead_id


def send_mail(row):
    payload = json.loads(row['payload'])
    msg = EmailMessage()
    # Stable ID lets a mail client group a retry if SMTP confirmation was lost.
    msg['Message-ID'] = '<octagon-' + row['id'] + '@mail.ru>'
    msg['From'] = 'Сайт OCTAGON-FIT <' + SMTP_USER + '>'
    msg['To'] = MAIL_TO
    msg['Subject'] = (payload['type'] or 'Заявка с сайта') + ' — OCTAGON-FIT'
    lines = ['Новая заявка с сайта OCTAGON-FIT', '']
    for key, label in LABELS.items():
        if payload.get(key):
            lines.append(label + ': ' + payload[key])
    lines.extend(['', 'Время (МСК): ' + row['received'], 'Номер заявки: ' + row['id']])
    msg.set_content('\n'.join(lines))
    if payload.get('resume'):
        resume = payload['resume']
        msg.add_attachment(base64.b64decode(resume['data']), maintype='application',
                           subtype='octet-stream', filename=resume['name'])
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context(), timeout=20) as smtp:
        smtp.login(SMTP_USER, SMTP_PASS)
        refused = smtp.send_message(msg)
        if refused:
            raise RuntimeError('Recipient rejected')


def deliver_pending():
    if not SMTP_USER or not SMTP_PASS:
        return
    with DELIVERY_LOCK:
        with connection() as db:
            rows = db.execute('SELECT * FROM leads WHERE mail_sent_at IS NULL AND next_attempt<=? ORDER BY created LIMIT 20',
                              (time.time(),)).fetchall()
        for row in rows:
            try:
                send_mail(row)
            except Exception as exc:
                # Log type/SMTP status only; never log secrets or full lead fields.
                error = type(exc).__name__ + ': ' + str(getattr(exc, 'smtp_code', 'transport error'))
                attempts = row['attempts'] + 1
                delay = min(3600, 30 * 2 ** min(attempts, 7))
                with connection() as db:
                    db.execute('UPDATE leads SET attempts=?, last_error=?, next_attempt=? WHERE id=?',
                               (attempts, error, time.time() + delay, row['id']))
                logging.warning('%s mail failed %s; retry queued', row['id'], error)
                write_event({'event': 'mail_failed', 'id': row['id'], 'error': error})
            else:
                sent = datetime.now(MSK).isoformat(timespec='seconds')
                with connection() as db:
                    db.execute('UPDATE leads SET mail_sent_at=?, attempts=attempts+1, last_error=NULL WHERE id=?',
                               (sent, row['id']))
                write_event({'event': 'mail_sent', 'id': row['id'], 'at': sent})
                logging.info('%s mail accepted by SMTP', row['id'])


def worker():
    while True:
        try:
            deliver_pending()
        except Exception:
            logging.exception('Mail worker error')
        WAKE.wait(30)
        WAKE.clear()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/api/health':
            return self.reply(200, {'ok': True, 'mail_configured': bool(SMTP_USER and SMTP_PASS)})
        self.reply(404, {'ok': False})

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path.split('?', 1)[0] != '/api/lead':
            return self.reply(404, {'ok': False})
        origin = self.headers.get('Origin', '')
        if origin and origin not in ORIGINS:
            return self.reply(403, {'ok': False})
        ip = (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()
        with RATE_LOCK:
            now = time.time()
            for key in list(HITS):
                if not HITS[key] or HITS[key][-1] < now - 600:
                    del HITS[key]
            q = HITS[ip]
            while q and now - q[0] > 600:
                q.popleft()
            if len(q) >= 10:
                return self.reply(429, {'ok': False, 'error': 'Попробуйте позже'})
            q.append(now)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8 * 1024 * 1024:
                return self.reply(413, {'ok': False})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Некорректный запрос')
            if data.get('website'):
                return self.reply(200, {'ok': True})
            payload = validate(data)
        except (ValueError, TypeError) as exc:
            return self.reply(422, {'ok': False, 'error': str(exc)[:100]})
        try:
            lead_id = accept(payload)
        except Exception:
            logging.exception('Could not persist lead')
            return self.reply(500, {'ok': False, 'error': 'Не удалось сохранить заявку'})
        # Confirmation means stored in the durable queue, not inbox delivery.
        self.reply(200, {'ok': True, 'queued': True, 'id': lead_id})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    init_db()
    threading.Thread(target=worker, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
