<?php
declare(strict_types=1);

// Configuration and rate-limit files live outside the document root.
ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

function wantsJson(): bool {
    return strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
}

function escape(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function respond(int $status, string $message, array $values = [], array $errors = [], bool $confirm = false): void {
    http_response_code($status);
    if (wantsJson()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $status === 200 && !$confirm, 'message' => $message, 'errors' => $errors]);
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Contact · Meet Julie</title><link rel="stylesheet" href="assets/site.css"><link rel="icon" href="assets/favicon.svg"></head><body><main class="response-page"><a href="index.html">JULIE</a><h1>Get in touch</h1><p role="status">' . escape($message) . '</p>';
    if ($values && ($confirm || $status !== 200)) {
        echo '<form action="contact.php" method="post"><input type="hidden" name="csrf" value="' . escape($_SESSION['csrf'] ?? '') . '">';
        foreach (['name' => 'Name', 'email' => 'Email', 'institution' => 'Institution or organisation (optional)', 'role' => 'Your role (optional)'] as $name => $label) {
            $type = $name === 'email' ? 'email' : 'text';
            $max = ['name' => 120, 'email' => 254, 'institution' => 200, 'role' => 80][$name];
            echo '<div class="field"><label for="' . $name . '">' . $label . '</label><input id="' . $name . '" name="' . $name . '" type="' . $type . '" maxlength="' . $max . '" value="' . escape($values[$name] ?? '') . '"' . (in_array($name, ['name', 'email'], true) ? ' required' : '') . '></div>';
        }
        echo '<div class="field"><label for="message">What are you working on? (optional)</label><textarea id="message" name="message" maxlength="5000">' . escape($values['message'] ?? '') . '</textarea></div><label class="consent"><input name="consent" type="checkbox" value="yes" required' . (($values['consent'] ?? '') === 'yes' ? ' checked' : '') . '><span>I agree to the use of my details to answer this enquiry. <a href="privacy.html">Privacy notice</a>.</span></label><button class="btn" type="submit">' . ($confirm ? 'Confirm and send' : 'Try again') . '</button></form>';
    }
    echo '<p><a href="index.html#contact">Back to the website</a> · <a href="privacy.html">Privacy</a></p></main></body></html>';
    exit;
}

function validAddress(string $address): bool {
    return strlen($address) <= 254 && filter_var($address, FILTER_VALIDATE_EMAIL) !== false
        && !preg_match('/[\r\n\x00]/', $address);
}

function textLength(string $value): int {
    return preg_match_all('/./us', $value, $matches) ?: 0;
}

function readConfig(): array {
    $path = getenv('JULIE_CONTACT_CONFIG') ?: '/home/openityh/.config/meetjulie/contact.php';
    if (!is_file($path) || !is_readable($path)) return [];
    $config = require $path;
    return is_array($config) ? $config : [];
}

// One locked, bounded store. No raw IP address or message is retained here.
function takeRateLimit(array $config): bool {
    $path = $config['rate_limit_file'];
    $handle = @fopen($path, 'c+');
    if (!$handle) throw new RuntimeException('rate_store');
    @chmod($path, 0600);
    if (!flock($handle, LOCK_EX)) { fclose($handle); throw new RuntimeException('rate_lock'); }
    try {
        $raw = stream_get_contents($handle, 1000001);
        if (strlen($raw) > 1000000) throw new RuntimeException('rate_size');
        $data = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($data)) throw new RuntimeException('rate_format');
        $now = time();
        $key = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['rate_limit_key']);
        $recent = [];
        $same = 0;
        foreach ($data as $entry) {
            if (!is_array($entry) || !isset($entry['at'], $entry['key'])) continue;
            if ($entry['at'] > $now - 3600) {
                $recent[] = $entry;
                if ($entry['key'] === $key && $entry['at'] > $now - 900) $same++;
            }
        }
        $allowed = $same < 3 && count($recent) < 100;
        if ($allowed) $recent[] = ['at' => $now, 'key' => $key];
        $encoded = json_encode($recent, JSON_THROW_ON_ERROR);
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) throw new RuntimeException('rate_write');
        return $allowed;
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    respond(405, 'Please use the contact form to send a message.');
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 24000) respond(413, 'This message is too long. Please shorten it and try again.');

session_name('julie_contact');
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true, 'samesite' => 'Lax'
]);
ini_set('session.use_strict_mode', '1');
if (!session_start()) respond(503, 'The contact form is temporarily unavailable. Please try again later.');
if (!isset($_SESSION['csrf'], $_SESSION['issued']) || time() - $_SESSION['issued'] > 1800) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['issued'] = time();
}
if ($method === 'GET') {
    if (wantsJson()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['csrf' => $_SESSION['csrf']]);
        exit;
    }
    respond(200, 'Use the contact form on the website to write to us.');
}

$fields = ['name' => 120, 'email' => 254, 'institution' => 200, 'role' => 80, 'message' => 5000, 'consent' => 3, 'website' => 200, 'csrf' => 128];
$values = []; $errors = [];
foreach ($fields as $name => $limit) {
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || !preg_match('//u', $value) || strpos($value, "\0") !== false) {
        $errors[$name] = 'Please check this field.'; $values[$name] = ''; continue;
    }
    $values[$name] = trim($value);
    if (textLength($value) > $limit || ($name !== 'message' && preg_match('/[\r\n]/', $value))) $errors[$name] = 'Please check the length and format of this field.';
}
if ($values['name'] === '') $errors['name'] = 'Please enter your name.';
if (!validAddress($values['email'])) $errors['email'] = 'Please enter a valid email address.';
if ($values['consent'] !== 'yes') $errors['consent'] = 'Please agree to the use of your details to answer this enquiry.';
$roles = ['', 'Systematic review author', 'Guideline panel or secretariat', 'HTA or evidence synthesis unit', 'Journal or methods editor', 'Researcher, other', 'Other'];
if (!in_array($values['role'], $roles, true)) $errors['role'] = 'Please choose one of the listed roles.';
if ($values['website'] !== '') respond(422, 'Your message could not be submitted. Please return to the contact form.');
if ($errors) respond(422, implode(' ', array_unique($errors)), $values, $errors);

try { $config = readConfig(); } catch (Throwable $error) { $config = []; }
$origins = $config['allowed_origins'] ?? ['https://meetjulie.org', 'https://www.meetjulie.org'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array($origin, $origins, true)) respond(403, 'Please send your message from the JULIE website.');
if ($values['csrf'] === '' && !wantsJson()) respond(200, 'Please review your message below, then confirm to send it.', $values, [], true);
if (!hash_equals($_SESSION['csrf'], $values['csrf'])) respond(403, 'Your form session has expired. Please try again; your details are still here.', $values);

if (!isset($config['recipient'], $config['sender'], $config['rate_limit_file'], $config['rate_limit_key'])
    || !validAddress($config['recipient']) || !validAddress($config['sender'])
    || !preg_match('/\A[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\z/', $config['sender'])
    || strlen($config['rate_limit_key']) < 32) {
    respond(503, 'The contact form is temporarily unavailable. Your message has not been sent. Please try again later.', $values);
}

try {
    if (!takeRateLimit($config)) {
        header('Retry-After: 900');
        respond(429, 'Too many messages have been submitted recently. Please wait at least 15 minutes before trying again.', $values);
    }
    $body = "JULIE website enquiry\n\nName: {$values['name']}\nEmail: {$values['email']}\nInstitution: {$values['institution']}\nRole: {$values['role']}\n\nMessage:\n{$values['message']}\n\nConsent to reply: yes\n";
    $body = preg_replace('/\r\n|\r|\n/', "\r\n", $body);
    $headers = [
        'From' => 'JULIE website <' . $config['sender'] . '>',
        'Reply-To' => $values['email'],
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'quoted-printable'
    ];
    $sent = mail($config['recipient'], 'JULIE website enquiry', quoted_printable_encode($body), $headers, '-f' . $config['sender']);
    if (!$sent) throw new RuntimeException('transport');
} catch (Throwable $error) {
    error_log('JULIE contact: delivery unavailable');
    respond(503, 'Your message could not be submitted. Your details are still here. Please try again later.', $values);
}
$_SESSION['csrf'] = bin2hex(random_bytes(32));
$_SESSION['issued'] = time();
respond(200, 'Thank you. Your message has been submitted for delivery. A person will reply; you will not be added to a mailing list.');
