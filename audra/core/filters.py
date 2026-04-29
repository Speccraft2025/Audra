
class FilterBuilder:
    """
    Dynamically generates FFmpeg filter strings by chaining multiple filters.
    """
    def __init__(self):
        self.filters = []

    def add(self, filter_str):
        if filter_str and isinstance(filter_str, str):
            self.filters.append(filter_str)

    def build(self):
        return ",".join(self.filters)


def text_watermark(text, position="bottom-right", opacity=0.7, fontsize=24):
    """
    Adds a text watermark using the drawtext filter.
    """
    pos_map = {
        "top-left": "x=20:y=20",
        "top-right": "x=w-tw-20:y=10", # adjusted padding
        "bottom-left": "x=20:y=h-th-20",
        "bottom-right": "x=w-tw-20:y=h-th-20",
        "center": "x=(w-tw)/2:y=(h-th)/2"
    }
    pos_str = pos_map.get(position, pos_map["bottom-right"])
    
    # Escape special FFmpeg characters
    safe_text = text.replace("'", "\\'").replace(":", "\\:")
    # Using the exact Ouroboros font path provided
    font_path = "/Users/speccraftmedialtd./Documents/Web/Audra/static/assets/ouroboros/fonts/Ouroboros-Regular.ttf"
    
    return (
        f"drawtext=text='{safe_text}':fontfile={font_path}:"
        f"fontsize={fontsize}:fontcolor=white@{opacity}:{pos_str}"
    )


def image_watermark(position="bottom-right"):
    """
    Returns the overlay filter configuration for an image watermark.
    """
    pos_map = {
        "top-left": "25:25",
        "top-right": "W-w-25:25",
        "bottom-left": "25:H-h-25",
        "bottom-right": "W-w-25:H-h-25",
        "center": "(W-w)/2:(H-h)/2"
    }
    pos_str = pos_map.get(position, "W-w-25:H-h-25")
    return f"overlay={pos_str}"


def text_overlay(text, start, end, position="center", fontsize=48):
    """
    Adds a timed text overlay (e.g., hooks) using drawtext with the enable parameter.
    """
    pos_map = {
        "top": "x=(w-tw)/2:y=h*0.2",
        "bottom": "x=(w-tw)/2:y=h*0.8",
        "center": "x=(w-tw)/2:y=(h-th)/2",
        "top-left": "x=60:y=60",
        "top-right": "x=w-tw-60:y=60",
        "bottom-left": "x=60:y=h-th-60",
        "bottom-right": "x=w-tw-60:y=h-th-60"
    }
    pos_str = pos_map.get(position, pos_map["center"])
    
    safe_text = text.replace("'", "\\'").replace(":", "\\:")
    font_path = "/Users/speccraftmedialtd./Documents/Web/Audra/static/assets/ouroboros/fonts/Ouroboros-Regular.ttf"
    
    return (
        f"drawtext=text='{safe_text}':fontfile={font_path}:fontsize={fontsize}:"
        f"enable='between(t,{start},{end})':fontcolor=white:"
        f"borderw=2:bordercolor=black@{0.8}:{pos_str}"
    )


def apply_effect_preset(preset_name, w=1920, h=1080, duration=0):
    """
    Returns a filter string for a predefined visual effect preset.
    duration: Total duration of the audio in seconds.
    """
    if preset_name == "clean":
        return ""
    
    elif preset_name == "zoom_slow":
        # Slow zoom in effect (0.05% per frame)
        return f"zoompan=z='min(zoom+0.0005,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}"
    
    elif preset_name == "fade_in_out":
        # Only fade out if we have a valid duration
        fade_in = "fade=t=in:st=0:d=1.5"
        if duration > 1.5:
            fade_out = f"fade=t=out:st={duration-1.5}:d=1.5"
            return f"{fade_in},{fade_out}"
        return fade_in
    
    elif preset_name == "vibrant":
        # Increase saturation and slightly boost contrast
        return "eq=saturation=1.5:contrast=1.1:brightness=0.02"
    
    return ""
