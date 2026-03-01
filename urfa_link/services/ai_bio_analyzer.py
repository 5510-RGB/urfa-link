import os
import google.generativeai as genai
from typing import List
from dotenv import load_dotenv
import json

load_dotenv() # Load variables from .env if present

API_KEY = os.environ.get("GEMINI_API_KEY", "MOCK_KEY")

if API_KEY != "MOCK_KEY" and API_KEY != "":
    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel('gemini-1.5-pro')
else:
    model = None

class AIBioAnalyzer:
    @staticmethod
    def analyze_bio(bio: str) -> List[float]:
        """
        Analyzes the user's bio using Gemini 1.5 Pro (or a mock) 
        and extracts an Interest-Vector.
        """
        if model is None:
            # Return a mock vector based on bio length for demo purposes
            # Simulating a multi-dimensional interest vector
            mock_vector = [(len(bio) % 10) / 10.0, (len(bio) * 2 % 10) / 10.0, 0.75, 0.85, 0.2]
            return mock_vector
            
        try:
            prompt = f"Şu biyografiyi oku: '{bio}'. Bana bu kişinin ilgi alanlarını 0 ile 1 arasında 5 farklı değer olarak (Doğa, Sanat, Teknoloji, Spor, Müzik) bir JSON dizisi [float, float, float, float, float] formatında dön. Sadece sayı listesini içeren tek bir satır JSON dön, başka bir açıklama yapma."
            response = model.generate_content(prompt)
            # Dönen cevap muhtemelen string formatında [0.8, 0.2, 0.9, 0.5, 0.1]
            content = response.text.replace('`','').replace('json','').strip()
            numbers = json.loads(content)
            
            if isinstance(numbers, list) and len(numbers) >= 5:
                return [float(x) for x in numbers[:5]]
        except Exception as e:
            print(f"Error in Gemini AI: {e}")
            
        return [0.5, 0.5, 0.5, 0.5, 0.5] # Default fallback vector
