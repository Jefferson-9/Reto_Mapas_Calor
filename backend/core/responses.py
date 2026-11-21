from rest_framework.response import Response


def ok(data=None, meta=None, status=200, headers=None):
    return Response({"success": True, "data": data, "meta": meta or {}, "error": None}, status=status, headers=headers)


def created(data=None, meta=None):
    return ok(data, meta, status=201)
