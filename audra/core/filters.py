
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


def apply_effect_preset(preset_name, intensity="medium", w=1920, h=1080, duration=0):
    """
    Returns a filter string for Audra v2 visual presets.
    intensity: "low", "medium", or "high"
    """
    intensity = intensity.lower()
    
    # Mapping intensity to numerical values
    lv = {"low": 1, "medium": 2, "high": 3}.get(intensity, 2)

    if preset_name == "ambient_drift":
        # Scale up slightly and drift the crop window
        drift = 0.05 * lv
        filters = [
            "format=yuv420p",
            f"scale=w=iw*1.1:h=-1", # Static scale
            f"crop={w}:{h}:(iw-{w})/2+{drift}*20*sin(t/2):(ih-{h})/2+{drift}*20*cos(t/2)",
            f"vignette=angle={0.1 * lv}"
        ]
        if lv >= 2:
            filters.append("curves=preset=vintage")
        return ",".join(filters)

    elif preset_name == "trap_pulse":
        # Use zoompan with 'time' for pulsing to keep output resolution constant
        pulse = 0.03 * lv
        filters = [
            "format=yuv420p",
            f"scale={w}:{h}",
            f"zoompan=z='1.05+{pulse}*sin(time*2*PI*2)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}",
            f"eq=contrast={1.1 + (0.1 * lv)}:saturation={1.3 + (0.1 * lv)}"
        ]
        if lv == 3:
            filters.append("noise=alls=10:allf=t+u")
        return ",".join(filters)

    elif preset_name == "cinematic_fade":
        # Very slow drift
        filters = [
            "format=yuv420p",
            f"scale=w=iw*1.05:h=-1",
            f"crop={w}:{h}:(iw-{w})/2+10*sin(t/4):(ih-{h})/2+10*cos(t/4)",
            f"eq=contrast={1.1}:saturation={0.8}:brightness=-0.02",
            f"vignette=angle={0.2 * lv}"
        ]
        if duration > 2:
            filters.append(f"fade=t=in:st=0:d=1.5,fade=t=out:st={duration-1.5}:d=1.5")
        return ",".join(filters)

    elif preset_name == "afro_glow":
        # Gentle breathing using zoompan
        filters = [
            "format=yuv420p",
            f"scale={w}:{h}",
            f"zoompan=z='1.03+0.02*sin(time)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}",
            f"eq=brightness=0.03:contrast=1.1:saturation={1.4 + (0.1 * lv)}",
            f"colorbalance=rs={0.08 * lv}:gs={0.04 * lv}:bs=-{0.08 * lv}"
        ]
        if lv >= 2:
            filters.append("unsharp=5:5:1.0:5:5:0.0")
        return ",".join(filters)

    elif preset_name == "hard_cut_energy":
        # High-freq jitter
        shake = 10 * lv
        filters = [
            "format=yuv420p",
            f"scale=w=iw*1.1:h=-1",
            f"crop={w}:{h}:(iw-{w})/2+{shake}*sin(20*t):(ih-{h})/2+{shake}*cos(20*t)",
            f"eq=contrast={1.3 + (0.1 * lv)}:brightness=0.03"
        ]
        if lv >= 2:
            filters.append("noise=c0s=15:c0f=t+u")
        return ",".join(filters)

    return ""
