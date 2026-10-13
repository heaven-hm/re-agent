"""Compare actual window captures without resizing or hiding visual differences."""
import json
import math
import sys
from PIL import Image, ImageChops, ImageStat

with Image.open(sys.argv[1]) as left_image, Image.open(sys.argv[2]) as right_image:
    left = left_image.convert("RGB")
    right = right_image.convert("RGB")
    result = {"original_dimensions": list(left.size), "replica_dimensions": list(right.size), "normalization": "RGB channels; no crop, resize, alignment, or tolerance"}
    if left.size != right.size:
        result.update(status="mismatch", reason="Window capture dimensions differ")
    else:
        difference = ImageChops.difference(left, right)
        histogram = difference.histogram()
        pixel_count = left.width * left.height
        squared = sum(count * (index % 256) ** 2 for index, count in enumerate(histogram))
        result.update(status="exact" if difference.getbbox() is None else "mismatch", rmse=math.sqrt(squared / (pixel_count * 3)), mean_absolute_channel_difference=sum(ImageStat.Stat(difference).mean) / 3)
        difference.save(sys.argv[3])
    print(json.dumps(result))
