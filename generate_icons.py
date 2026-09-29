#!/usr/bin/env python3
"""Generate schedule app icons with a calendar/timetable design."""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """Create a schedule icon with dark theme."""
    # Dark background
    bg_color = (13, 17, 23)
    grid_color = (48, 54, 61)
    accent_color = (88, 166, 255)
    highlight_color = (255, 166, 87)
    
    # Create image with dark background
    img = Image.new('RGBA', (size, size), bg_color + (255,))
    draw = ImageDraw.Draw(img)
    
    # Add padding
    padding = int(size * 0.12)
    inner = size - 2 * padding
    
    # Draw rounded rectangle background
    corner_radius = int(size * 0.15)
    draw.rounded_rectangle(
        [(padding, padding), (size - padding, size - padding)],
        radius=corner_radius,
        fill=(22, 27, 34, 255),
        outline=grid_color,
        width=max(2, int(size * 0.01))
    )
    
    # Draw header bar (calendar header)
    header_height = int(inner * 0.22)
    draw.rounded_rectangle(
        [(padding, padding), (size - padding, padding + header_height)],
        radius=corner_radius,
        fill=accent_color + (255,)
    )
    
    # Draw clock icon in header
    clock_x = padding + int(inner * 0.15)
    clock_y = padding + header_height // 2
    clock_r = int(header_height * 0.3)
    draw.ellipse(
        [(clock_x - clock_r, clock_y - clock_r), 
         (clock_x + clock_r, clock_y + clock_r)],
        fill=bg_color + (255,),
        outline=None
    )
    # Clock hands
    hand_len = int(clock_r * 0.6)
    draw.line([(clock_x, clock_y), (clock_x + hand_len * 0.5, clock_y - hand_len * 0.7)], 
              fill=accent_color + (255,), width=max(1, int(size * 0.008)))
    draw.line([(clock_x, clock_y), (clock_x + hand_len * 0.8, clock_y)], 
              fill=accent_color + (255,), width=max(1, int(size * 0.008)))
    
    # Draw schedule grid (3 rows of time slots)
    grid_top = padding + header_height + int(inner * 0.1)
    grid_spacing = int(inner * 0.15)
    row_height = int(inner * 0.12)
    bar_left = padding + int(inner * 0.12)
    bar_width = int(inner * 0.75)
    
    colors = [
        (88, 166, 255),   # Blue
        (255, 166, 87),   # Orange
        (163, 113, 247),  # Purple
    ]
    
    for i, color in enumerate(colors):
        y = grid_top + i * (row_height + grid_spacing)
        # Draw time slot bar
        bar_corner = int(row_height * 0.3)
        draw.rounded_rectangle(
            [(bar_left, y), (bar_left + bar_width, y + row_height)],
            radius=bar_corner,
            fill=color + (255,)
        )
        # Draw time indicator dot
        dot_r = int(row_height * 0.15)
        dot_x = padding + int(inner * 0.05)
        dot_y = y + row_height // 2
        draw.ellipse(
            [(dot_x - dot_r, dot_y - dot_r), 
             (dot_x + dot_r, dot_y + dot_r)],
            fill=color + (255,)
        )
    
    # Save
    img.save(output_path, 'PNG')
    print(f"Created {output_path} ({size}x{size})")

def create_maskable_icon(size, output_path):
    """Create a maskable icon with safe zone."""
    # For maskable icons, we need at least 20% safe zone
    safe_zone = int(size * 0.1)
    
    # Create larger canvas
    canvas_size = size
    img = Image.new('RGBA', (canvas_size, canvas_size), (13, 17, 23, 255))
    
    # Create the main icon at reduced size
    temp_size = size - 2 * safe_zone
    temp_img = Image.new('RGBA', (size, size), (13, 17, 23, 255))
    draw = ImageDraw.Draw(temp_img)
    
    # Draw with same style but scaled
    create_icon_content(draw, size, safe_zone)
    
    # Save
    temp_img.save(output_path, 'PNG')
    print(f"Created maskable {output_path} ({size}x{size})")

def create_icon_content(draw, size, offset):
    """Draw icon content with offset for safe zone."""
    bg_color = (13, 17, 23)
    grid_color = (48, 54, 61)
    accent_color = (88, 166, 255)
    
    padding = int(size * 0.12) + offset
    inner = size - 2 * padding
    
    # Draw rounded rectangle background
    corner_radius = int(size * 0.15)
    draw.rounded_rectangle(
        [(padding, padding), (size - padding, size - padding)],
        radius=corner_radius,
        fill=(22, 27, 34, 255),
        outline=grid_color,
        width=max(2, int(size * 0.01))
    )
    
    # Continue with same drawing logic...

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(script_dir, 'icons')
    os.makedirs(icons_dir, exist_ok=True)
    
    # Create regular icons
    create_icon(192, os.path.join(icons_dir, 'icon-192.png'))
    create_icon(512, os.path.join(icons_dir, 'icon-512.png'))
    
    print("\nIcons generated successfully!")
    print("Note: Using the same icons for maskable since the design has built-in padding.")
