import os
import time
import glob
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as imageio
from playwright.sync_api import sync_playwright

OUTPUT_DIR = "assets"
DOC_IMG_DIR = "website/static/img"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(DOC_IMG_DIR, exist_ok=True)

# Quadrant dimensions
Q_WIDTH = 640
Q_HEIGHT = 380
HEADER_HEIGHT = 32

TITLE_BG = (30, 41, 59)       # Dark slate header bar
TITLE_TEXT_COLOR = (255, 255, 255)
BORDER_COLOR = (71, 85, 105)

QUADRANT_TITLES = [
    "1. Lineage & Column DAG Visualization",
    "2. Run Orchestration & Real-time Logs",
    "3. Data Catalog & Metadata Search",
    "4. SQL Workspace & Query Execution"
]

def add_header_to_frame(frame_img: Image.Image, title: str) -> Image.Image:
    """Resizes frame to Q_WIDTH x (Q_HEIGHT - HEADER_HEIGHT) and adds a styled title header bar on top."""
    resized = frame_img.resize((Q_WIDTH, Q_HEIGHT - HEADER_HEIGHT), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (Q_WIDTH, Q_HEIGHT), TITLE_BG)

    # Draw header bar
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, Q_WIDTH, HEADER_HEIGHT], fill=TITLE_BG)

    # Font
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    except Exception:
        font = ImageFont.load_default()

    draw.text((12, 7), title, fill=TITLE_TEXT_COLOR, font=font)
    canvas.paste(resized, (0, HEADER_HEIGHT))
    return canvas

def capture_usecases():
    print("Starting Playwright to capture 4 use cases...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Viewport for capturing each page cleanly
        context = browser.new_context(viewport={"width": 1280, "height": 760})
        page = context.new_page()

        frames_dict = {0: [], 1: [], 2: [], 3: []}
        num_frames = 20

        # --- USE CASE 1: Lineage Visualization ---
        print("Capturing Use Case 1: Lineage...")
        page.goto("http://localhost:3080/lineage", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Click model node or toggle column lineage if available
        for i in range(num_frames):
            if i == 5:
                # Click on a node or column lineage button
                try:
                    col_btn = page.query_selector("button:has-text('Column Lineage')") or page.query_selector("button:has-text('Column')")
                    if col_btn:
                        col_btn.click()
                except Exception:
                    pass
            elif i == 12:
                try:
                    # Click on a node in lineage graph
                    nodes = page.query_selector_all(".react-flow__node")
                    if nodes:
                        nodes[min(2, len(nodes)-1)].click()
                except Exception:
                    pass
            page.wait_for_timeout(150)
            screenshot_bytes = page.screenshot()
            from io import BytesIO
            frames_dict[0].append(Image.open(BytesIO(screenshot_bytes)).convert("RGB"))

        # --- USE CASE 2: Run Orchestration & Logs ---
        print("Capturing Use Case 2: Run Orchestration...")
        page.goto("http://localhost:3080/runs", wait_until="networkidle")
        page.wait_for_timeout(1000)

        # Trigger run or inspect history
        for i in range(num_frames):
            if i == 4:
                try:
                    run_btn = page.query_selector("button:has-text('Run dbt')") or page.query_selector("button:has-text('Execute')") or page.query_selector("button:has-text('Run')")
                    if run_btn:
                        run_btn.click()
                except Exception:
                    pass
            page.wait_for_timeout(150)
            screenshot_bytes = page.screenshot()
            from io import BytesIO
            frames_dict[1].append(Image.open(BytesIO(screenshot_bytes)).convert("RGB"))

        # --- USE CASE 3: Data Catalog & Metadata Search ---
        print("Capturing Use Case 3: Data Catalog...")
        page.goto("http://localhost:3080/models", wait_until="networkidle")
        page.wait_for_timeout(1000)

        for i in range(num_frames):
            if i == 4:
                try:
                    search_input = page.query_selector("input[type='text']") or page.query_selector("input[placeholder*='search' i]") or page.query_selector("input")
                    if search_input:
                        search_input.fill("customer")
                except Exception:
                    pass
            elif i == 10:
                try:
                    model_item = page.query_selector("tr, .model-card, div:has-text('customers')")
                    if model_item:
                        model_item.click()
                except Exception:
                    pass
            page.wait_for_timeout(150)
            screenshot_bytes = page.screenshot()
            from io import BytesIO
            frames_dict[3 if False else 2].append(Image.open(BytesIO(screenshot_bytes)).convert("RGB"))

        # --- USE CASE 4: SQL Workspace ---
        print("Capturing Use Case 4: SQL Workspace...")
        page.goto("http://localhost:3080/sql", wait_until="networkidle")
        page.wait_for_timeout(1000)

        for i in range(num_frames):
            if i == 5:
                try:
                    run_sql_btn = page.query_selector("button:has-text('Run Query')") or page.query_selector("button:has-text('Run')") or page.query_selector("button:has-text('Execute')")
                    if run_sql_btn:
                        run_sql_btn.click()
                except Exception:
                    pass
            page.wait_for_timeout(150)
            screenshot_bytes = page.screenshot()
            from io import BytesIO
            frames_dict[3].append(Image.open(BytesIO(screenshot_bytes)).convert("RGB"))

        browser.close()

    print("Processing captured frames and building GIFs...")

    # Build individual quadrant GIFs
    quadrant_gifs = []
    gif_names = ["lineage-usecase.gif", "run-usecase.gif", "catalog-usecase.gif", "sql-usecase.gif"]

    for idx in range(4):
        raw_frames = frames_dict[idx]
        processed_frames = []
        for frame in raw_frames:
            hdr_frame = add_header_to_frame(frame, QUADRANT_TITLES[idx])
            processed_frames.append(hdr_frame)

        path_assets = os.path.join(OUTPUT_DIR, gif_names[idx])
        path_docs = os.path.join(DOC_IMG_DIR, gif_names[idx])

        # Save GIF
        processed_frames[0].save(
            path_assets,
            save_all=True,
            append_images=processed_frames[1:],
            duration=200,
            loop=0
        )
        processed_frames[0].save(
            path_docs,
            save_all=True,
            append_images=processed_frames[1:],
            duration=200,
            loop=0
        )
        print(f"Saved {path_assets} and {path_docs}")

    # Build 2x2 multi-tiled 4-quadrant combined GIF
    print("Combining 4 quadrants into multi-tiled layout (demo.gif)...")
    combined_frames = []
    total_grid_w = Q_WIDTH * 2 + 4
    total_grid_h = Q_HEIGHT * 2 + 4

    min_frames = min(len(frames_dict[0]), len(frames_dict[1]), len(frames_dict[2]), len(frames_dict[3]))

    for frame_idx in range(min_frames):
        q1 = add_header_to_frame(frames_dict[0][frame_idx], QUADRANT_TITLES[0])
        q2 = add_header_to_frame(frames_dict[1][frame_idx], QUADRANT_TITLES[1])
        q3 = add_header_to_frame(frames_dict[2][frame_idx], QUADRANT_TITLES[2])
        q4 = add_header_to_frame(frames_dict[3][frame_idx], QUADRANT_TITLES[3])

        grid_canvas = Image.new("RGB", (total_grid_w, total_grid_h), (51, 65, 85))
        grid_canvas.paste(q1, (0, 0))
        grid_canvas.paste(q2, (Q_WIDTH + 4, 0))
        grid_canvas.paste(q3, (0, Q_HEIGHT + 4))
        grid_canvas.paste(q4, (Q_WIDTH + 4, Q_HEIGHT + 4))

        combined_frames.append(grid_canvas)

    demo_gif_assets = os.path.join(OUTPUT_DIR, "demo.gif")
    demo_gif_docs = os.path.join(DOC_IMG_DIR, "demo.gif")

    combined_frames[0].save(
        demo_gif_assets,
        save_all=True,
        append_images=combined_frames[1:],
        duration=200,
        loop=0
    )
    combined_frames[0].save(
        demo_gif_docs,
        save_all=True,
        append_images=combined_frames[1:],
        duration=200,
        loop=0
    )
    print(f"Successfully generated 4-quadrant preview GIF at {demo_gif_assets} and {demo_gif_docs}")

if __name__ == "__main__":
    capture_usecases()
