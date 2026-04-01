import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

EMAIL_USER = os.environ.get("EMAIL_USER", "")
EMAIL_PASS = os.environ.get("EMAIL_PASS", "")

def send_otp_email(to_email: str, otp_code: str, user_name: str = "Kullanıcı") -> bool:
    """
    Gmail SMTP ile OTP kodu gönderir.
    Returns True on success, False on failure.
    """
    if not EMAIL_USER or not EMAIL_PASS:
        print(f"[EMAIL MOCK] OTP {otp_code} gönderilecekti: {to_email}")
        return True  # Mock mode - dev ortamında logda görünür

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Urfa-Link Giriş Doğrulama Kodunuz"
        msg["From"] = EMAIL_USER
        msg["To"] = to_email

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #fff; padding: 20px;">
            <div style="max-width: 400px; margin: auto; background: #1a1a2e; border-radius: 12px; padding: 30px; border: 1px solid #00ff88;">
                <h2 style="color: #00ff88; text-align: center;">URFA-LİNK</h2>
                <p>Merhaba <b>{user_name}</b>,</p>
                <p>Giriş yapabilmek için aşağıdaki <b>6 haneli doğrulama kodunu</b> kullanın:</p>
                <div style="text-align: center; margin: 20px 0;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #00ff88; background: #0f0f1a; padding: 10px 20px; border-radius: 8px;">
                        {otp_code}
                    </span>
                </div>
                <p style="color: #aaa;">Bu kod <b>5 dakika</b> geçerlidir.</p>
                <p style="color: #aaa;">Eğer bu işlemi siz yapmadıysanız, lütfen dikkate almayın.</p>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, to_email, msg.as_string())

        return True

    except Exception as e:
        print(f"[EMAIL ERROR] E-posta gönderilemedi: {e}")
        return False
