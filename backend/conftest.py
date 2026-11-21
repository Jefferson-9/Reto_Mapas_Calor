"""Fixtures compartidas: árbol territorial pequeño con polígonos reales en PostGIS, roles, usuarios por rol y cliente autenticado."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.gis.geos import MultiPolygon, Point, Polygon
from django.core.cache import cache
from rest_framework.test import APIClient

from core.models import ParametroSistema
from modules.cartera.esquemas_iniciales import ESQUEMAS_INICIALES
from modules.cartera.models import CargaDatos, Credito, EsquemaCarga, Pago, Socio
from modules.territorio.models import Agencia, Ubicacion, Zona
from modules.usuarios.catalogo import MATRIZ, PERMISOS, ROLES
from modules.usuarios.models import Permiso, Rol, Usuario

PASSWORD = "Prueba-Segura-2026!"


def cuadro(lng, lat, d=0.01):
    return MultiPolygon(Polygon.from_bbox((lng - d, lat - d, lng + d, lat + d)), srid=4326)


@pytest.fixture(autouse=True)
def _limpiar_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def base(db):
    for codigo, desc, grupo in PERMISOS:
        Permiso.objects.create(codigo=codigo, descripcion=desc, grupo=grupo)
    for codigo, nombre in ROLES.items():
        r = Rol.objects.create(codigo=codigo, nombre=nombre)
        r.permisos.set(Permiso.objects.filter(codigo__in=MATRIZ[codigo]))
    ParametroSistema.actual()
    for tipo, campos in ESQUEMAS_INICIALES.items():
        EsquemaCarga.objects.create(tipo=tipo, version=1, vigente=True, campos=campos)
    matriz = Agencia.objects.create(codigo="MATRIZ", nombre="Matriz", ubicacion=Point(-79.20, -3.99, srid=4326))
    sur = Agencia.objects.create(codigo="SUR", nombre="Sur", ubicacion=Point(-79.20, -4.02, srid=4326))
    prov = Zona.objects.create(codigo="P", nombre="Provincia", tipo_zona="provincia", poligono=cuadro(-79.20, -4.0, 0.05))
    can = Zona.objects.create(codigo="C", nombre="Cantón", tipo_zona="canton", zona_superior=prov, poligono=cuadro(-79.20, -4.0, 0.05))
    pa = Zona.objects.create(codigo="PA", nombre="Parroquia A", tipo_zona="parroquia", zona_superior=can, agencia=matriz, poligono=cuadro(-79.20, -3.99, 0.02))
    pb = Zona.objects.create(codigo="PB", nombre="Parroquia B", tipo_zona="parroquia", zona_superior=can, agencia=sur, poligono=cuadro(-79.20, -4.03, 0.01))
    b1 = Zona.objects.create(codigo="B1", nombre="Barrio 1", tipo_zona="barrio", zona_superior=pa, agencia=matriz, poligono=cuadro(-79.21, -3.99),
                             centroide=Point(-79.21, -3.99, srid=4326), hogares_estimados=100, fuente_oficial="DEMO (sintético)")
    b2 = Zona.objects.create(codigo="B2", nombre="Barrio 2", tipo_zona="barrio", zona_superior=pa, agencia=matriz, poligono=cuadro(-79.19, -3.99),
                             centroide=Point(-79.19, -3.99, srid=4326), hogares_estimados=200, fuente_oficial="DEMO (sintético)")
    b3 = Zona.objects.create(codigo="B3", nombre="Barrio 3", tipo_zona="barrio", zona_superior=pb, agencia=sur, poligono=cuadro(-79.20, -4.03),
                             centroide=Point(-79.20, -4.03, srid=4326), hogares_estimados=None, fuente_oficial="DEMO (sintético)")
    usuarios = {}
    for username, rol, ag in [("admin", "admin", None), ("gerencia", "gerencia", None), ("jefe", "jefe_agencia", matriz), ("jefesur", "jefe_agencia", sur),
                              ("oficial", "oficial", matriz), ("oficialsur", "oficial", sur), ("supervisor", "supervisor", None),
                              ("metodologia", "metodologia", None)]:
        u = Usuario(username=username, nombre_completo=username.title(), cargo=rol, rol=Rol.objects.get(codigo=rol), agencia=ag)
        u.set_password(PASSWORD)
        u.save()
        usuarios[username] = u
    inactivo = Usuario(username="inactivo", nombre_completo="Inactivo", rol=Rol.objects.get(codigo="oficial"), agencia=matriz, activo=False)
    inactivo.set_password(PASSWORD)
    inactivo.save()
    usuarios["inactivo"] = inactivo
    return {"agencias": {"MATRIZ": matriz, "SUR": sur}, "zonas": {"P": prov, "C": can, "PA": pa, "PB": pb, "B1": b1, "B2": b2, "B3": b3}, "usuarios": usuarios}


@pytest.fixture
def datos(base):
    """Socios, créditos y pagos de dos períodos (2026-09 y 2026-10) en B1, B2 y B3, e indicadores calculados."""
    from config.container import servicio_indicadores

    admin = base["usuarios"]["admin"]
    cargas = {}
    for p in ("2026-09", "2026-10"):
        cargas[p] = CargaDatos.objects.create(nombre_archivo=f"t_{p}.csv", hash_archivo=p, tipo="socios", periodo=p, usuario=admin, estado="completada",
                                              confirmada_en=datetime.datetime(2026, int(p[-2:]), 28, tzinfo=datetime.timezone.utc))
    n = 0
    for zcod, socios, morosos in (("B1", 4, 1), ("B2", 2, 0), ("B3", 3, 2)):
        z = base["zonas"][zcod]
        for i in range(socios):
            n += 1
            u = Ubicacion.objects.create(punto=Point(z.centroide.x + 0.001 * i, z.centroide.y, srid=4326), latitud=Decimal(str(round(z.centroide.y, 6))),
                                         longitud=Decimal(str(round(z.centroide.x + 0.001 * i, 6))), zona=z)
            s = Socio.objects.create(codigo_socio=f"S{n}", cedula_hash=f"h{n}", cedula_mascara="******0000", nombre=f"Socio {n}", agencia=z.agencia, zona=z,
                                     ubicacion=u, fecha_ingreso=datetime.date(2026, 1, 1))
            c = Credito.objects.create(codigo_credito=f"C{n}", socio=s, zona=z, monto=Decimal("1000.00"), fecha_desembolso=datetime.date(2026, 2, 1),
                                       plazo_meses=12, estado="vigente")
            for p in ("2026-09", "2026-10"):
                late = i < morosos and p == "2026-10"
                Pago.objects.create(credito=c, periodo=p, valor_pagado=Decimal("0" if late else "90"), valor_pendiente=Decimal("250" if late else "0"),
                                    dias_atraso=30 if late else 0)
    servicio_indicadores().recalcular(["2026-09", "2026-10"], None)
    return base


def cliente_para(usuario, password=PASSWORD):
    c = APIClient()
    r = c.post("/api/v1/auth/login/", {"username": usuario.username, "password": password}, format="json")
    assert r.status_code == 200, r.content
    c.credentials(HTTP_AUTHORIZATION="Bearer " + r.json()["data"]["access"])
    return c


@pytest.fixture
def api(base):
    cache_clientes = {}

    def _get(username):
        if username not in cache_clientes:
            cache_clientes[username] = cliente_para(base["usuarios"][username])
        return cache_clientes[username]

    return _get
