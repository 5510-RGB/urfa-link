# Resmi hafif Python imajı
FROM python:3.10-slim

# Çalışma dizinini ayarla
WORKDIR /app

# Gerekli sistem paketlerini kur (postgresql bağımlılıkları ve C++ derleyiciler bcrypt için)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Bağımlılıkları kopyala ve kur
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodunu kopyala
COPY . .

# FastAPI portunu aç (Render için dinamik port desteğiyle)
EXPOSE 8000

# Uygulamayı başlat (Render'da PORT ortam değişkeni üzerinden ezilecek)
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
