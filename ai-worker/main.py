from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from paddleocr import PaddleOCR
from pdf2image import convert_from_bytes
from PIL import Image
import pdfplumber
import io
import numpy as np
import cv2
import uvicorn
import paddle
import json
import asyncio
import logging

# Wycisz warningi pdfplumber
logging.getLogger('pdfminer').setLevel(logging.ERROR)

app = FastAPI()

# --- KONFIGURACJA POPPLER (Dostosuj ścieżkę jeśli trzeba) ---
POPPLER_PATH = r"D:\Pobrane\Release-25.12.0-0\poppler-25.12.0\Library\bin"


def optimize_image_for_ocr(img_np):
    """
    SUPER PREPROCESSING:
    Naprawia zdjęcia książek/dokumentów (JPG/PNG).
    Obsługuje: Biały tekst na ciemnym tle, Odblaski, Małą rozdzielczość.
    """
    # 1. Konwersja do skali szarości
    if len(img_np.shape) == 3:
        gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_np

    # 2. UPSCALING (Kluczowe dla zdjęć z telefonu)
    # Zwiększamy obraz, aby litery były wyraźne dla sieci neuronowej
    h, w = gray.shape
    min_dim = min(h, w)
    target_min_dim = 1800  # Celujemy w wysoką rozdzielczość

    scale = 1.0
    if min_dim < target_min_dim:
        scale = target_min_dim / min_dim
        # Interpolacja CUBIC jest najlepsza do zachowania ostrości przy powiększaniu
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # 3. KOREKCJA OŚWIETLENIA (CLAHE)
    # Wyrównuje histogram, usuwając wpływ cieni i odblasków
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # 4. WYKRYWANIE JASNEGO TEKSTU (Białe napisy na ciemnym tle - np. Twoja książka)
    # Sprawdzamy średnią jasność. Jeśli < 127, to obraz jest "ciemny".
    mean_brightness = np.mean(gray)
    if mean_brightness < 127:
        # Robimy negatyw -> Ciemne tło staje się białe, biały tekst czarny.
        # OCR o wiele lepiej radzi sobie z czarnym tekstem.
        gray = cv2.bitwise_not(gray)

    # 5. Odszumianie (Delikatne)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)

    # 6. Binaryzacja Adaptacyjna (Thresholding)
    # Zamienia szarości na czystą czerń i biel.
    binary = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=25,  # Rozmiar bloku analizy
        C=10  # Stała odejmowana od średniej (wycina szum tła)
    )

    # 7. Oczyszczanie (Morfologia)
    # Usuwa drobne kropki i "skleja" rozerwane litery
    kernel = np.ones((1, 1), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # 8. Dodanie ramki (Padding)
    # Zapobiega ucinaniu tekstu przy krawędziach
    binary = cv2.copyMakeBorder(binary, 50, 50, 50, 50, cv2.BORDER_CONSTANT, value=255)

    # Konwersja do 3 kanałów (wymagane przez Paddle w niektórych trybach)
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def preprocess_image_for_ocr_pdf(img_np):
    """STARY preprocessing zachowany dla PDF (działa dobrze na skanach)"""
    if len(img_np.shape) == 3:
        gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_np

    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    binary = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, blockSize=11, C=2)
    kernel = np.ones((1, 1), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


print("⏳ Konfiguracja urządzenia...")
try:
    paddle.device.set_device('gpu')
    print(f"✅ GPU: {paddle.device.get_device()}")
except Exception as e:
    print(f"⚠️ CPU: {e}")
    paddle.device.set_device('cpu')

print("⏳ Inicjalizacja PaddleOCR...")
# UWAGA: Zmieniono lang na 'en' pod Twoją książkę.
# PaddleOCR ustawiony na 'pl' bardzo źle radzi sobie z angielskim tekstem.
ocr = PaddleOCR(
    lang='en',  # ZMIANA: English dla lepszej detekcji książek typu Hormozi
    use_angle_cls=True,
    show_log=False,
    det_db_thresh=0.3,  # Zmniejszony próg detekcji (łapie więcej tekstu)
    det_db_box_thresh=0.5,
    det_db_unclip_ratio=1.7,
    rec_batch_num=30,
    drop_score=0.5,
    use_gpu=True,
    gpu_mem=6000,
)
print("✅ Model gotowy!")


@app.get("/")
def health_check():
    return {"status": "online", "device": paddle.device.get_device()}


@app.post("/ocr-stream")
async def ocr_stream(file: UploadFile = File(...)):
    """OCR z inteligentną detekcją i SUPER PREPROCESSINGIEM dla zdjęć"""

    async def generate():
        try:
            allowed_types = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]
            if file.content_type not in allowed_types:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Niedozwolony typ pliku'})}\n\n"
                return

            # 1. Wczytanie pliku
            contents = await file.read()
            file_size_mb = len(contents) / (1024 * 1024)
            yield f"data: {json.dumps({'status': 'loading', 'message': f'File loaded: {file_size_mb:.2f} MB'})}\n\n"
            await asyncio.sleep(0.1)

            full_text = ""

            # 2. Obsługa PDF
            if file.content_type == "application/pdf":
                yield f"data: {json.dumps({'status': 'analyzing', 'message': 'Analyzing PDF structure...'})}\n\n"

                pdf_file = io.BytesIO(contents)
                with pdfplumber.open(pdf_file) as pdf:
                    total_pages = len(pdf.pages)
                    yield f"data: {json.dumps({'status': 'start', 'total': total_pages, 'message': f'Processing {total_pages} pages'})}\n\n"

                    # Konwersja PDF do obrazów (backup dla skanów)
                    try:
                        images = convert_from_bytes(
                            contents, dpi=300, grayscale=True,  # 300 DPI wystarczy, bo mamy upscaling
                            poppler_path=POPPLER_PATH,
                            fmt='png'
                        )
                    except Exception as e:
                        yield f"data: {json.dumps({'status': 'error', 'message': f'Poppler error: {str(e)}'})}\n\n"
                        return

                    for i, page in enumerate(pdf.pages):
                        page_num = i + 1
                        extracted_text = page.extract_text()

                        # Czy jest tekst cyfrowy?
                        if extracted_text and len(extracted_text.strip()) > 500:
                            yield f"data: {json.dumps({'status': 'extracted', 'current': page_num, 'total': total_pages, 'message': f'Page {page_num}: Text extracted natively'})}\n\n"
                            page_text = extracted_text
                        else:
                            # OCR dla skanu w PDF
                            yield f"data: {json.dumps({'status': 'ocr', 'current': page_num, 'total': total_pages, 'message': f'Page {page_num}: Scan detected - enhancing & OCR...'})}\n\n"

                            img_np = np.array(images[i])
                            # Normalizacja kanałów
                            if len(img_np.shape) == 2:
                                img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2BGR)
                            elif img_np.shape[2] == 4:
                                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
                            elif img_np.shape[2] == 3:
                                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

                            # Używamy starego preprocessingu dla PDF (jest bezpieczniejszy dla dokumentów biurowych)
                            processed = preprocess_image_for_ocr_pdf(img_np)

                            result = ocr.ocr(processed, cls=True)
                            lines = []
                            if result and result[0]:
                                lines = [line[1][0] for line in result[0] if line[1][1] > 0.5]

                            page_text = "\n".join(lines)
                            yield f"data: {json.dumps({'status': 'extracted', 'current': page_num, 'total': total_pages, 'message': f'Page {page_num}: OCR done'})}\n\n"

                        full_text += f"\n--- Strona {page_num} ---\n{page_text}\n"

            # 3. Obsługa OBRAZÓW (JPG/PNG) - TUTAJ JEST GŁÓWNA ZMIANA
            else:
                yield f"data: {json.dumps({'status': 'start', 'total': 1, 'message': 'Processing image upload'})}\n\n"

                img = Image.open(io.BytesIO(contents))
                img_np = np.array(img)

                # Normalizacja kanałów
                if len(img_np.shape) == 2:
                    img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2BGR)
                elif img_np.shape[2] == 4:
                    img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
                elif img_np.shape[2] == 3:
                    img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

                # ZAWSZE uruchamiamy SUPER PREPROCESSING dla pojedynczych zdjęć
                yield f"data: {json.dumps({'status': 'preprocessing', 'current': 1, 'total': 1, 'message': 'Applying Advanced Enhancement (Upscale + Inversion + Denoise)...'})}\n\n"
                await asyncio.sleep(0.05)

                # Użycie nowej funkcji 'optimize_image_for_ocr'
                processed_img = optimize_image_for_ocr(img_np)

                yield f"data: {json.dumps({'status': 'ocr', 'current': 1, 'total': 1, 'message': 'Running Neural Network OCR...'})}\n\n"
                result = ocr.ocr(processed_img, cls=True)

                if result and result[0]:
                    # Sortowanie wyników (czytanie od góry do dołu)
                    boxes = [line for line in result[0]]
                    boxes.sort(key=lambda x: x[0][0][1])

                    lines = [line[1][0] for line in boxes if line[1][1] > 0.5]
                    full_text = "\n".join(lines)
                    yield f"data: {json.dumps({'status': 'extracted', 'current': 1, 'total': 1, 'message': f'Success: {len(lines)} lines found'})}\n\n"
                else:
                    yield f"data: {json.dumps({'status': 'extracted', 'current': 1, 'total': 1, 'message': 'No text found'})}\n\n"

            # 4. Zakończenie
            yield f"data: {json.dumps({'status': 'done', 'text': full_text.strip(), 'message': 'Processing completed!'})}\n\n"

        except Exception as e:
            logging.error(f"Error: {e}")
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/ocr")
async def ocr_process(file: UploadFile = File(...)):
    """Endpoint bez streamingu (zaktualizowany o nowe funkcje)"""
    allowed_types = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Niedozwolony typ pliku")

    try:
        contents = await file.read()
        full_text = ""
        images = []

        if file.content_type == "application/pdf":
            images = convert_from_bytes(
                contents, dpi=300, grayscale=True,
                poppler_path=POPPLER_PATH, fmt='png'
            )
            # Dla PDF używamy starego preprocessingu
            preprocess_func = preprocess_image_for_ocr_pdf
        else:
            images = [Image.open(io.BytesIO(contents))]
            # Dla JPG używamy SUPER preprocessingu
            preprocess_func = optimize_image_for_ocr

        for i, img in enumerate(images):
            img_np = np.array(img)
            if len(img_np.shape) == 2:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2BGR)
            elif img_np.shape[2] == 4:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
            elif img_np.shape[2] == 3:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            processed = preprocess_func(img_np)
            result = ocr.ocr(processed, cls=True)

            if result and result[0]:
                lines = [line[1][0] for line in result[0] if line[1][1] > 0.5]
                full_text += f"\n--- Strona {i + 1} ---\n" + "\n".join(lines) + "\n"

        return {"filename": file.filename, "text": full_text.strip()}

    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)