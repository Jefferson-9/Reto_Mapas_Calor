"""Renderizador JSON con el sobre uniforme y decimales como texto (nunca float)."""

import datetime
import decimal
import uuid

from rest_framework.renderers import JSONRenderer
from rest_framework.utils.encoders import JSONEncoder


class CoacJSONEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return format(obj, "f")
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        return super().default(obj)


class EnvelopeJSONRenderer(JSONRenderer):
    encoder_class = CoacJSONEncoder

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if not (isinstance(data, dict) and "success" in data and "error" in data):
            data = {"success": True, "data": data, "meta": {}, "error": None}
        return super().render(data, accepted_media_type, renderer_context)
