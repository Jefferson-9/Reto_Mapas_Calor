"""Datos semilla de demostración (idempotente; nunca automático en producción).

Todo es SINTÉTICO: límites esquemáticos («DEMO (sintético)»), nombres, cédulas y cifras financieras.
Uso: python manage.py seed_coac
"""

import datetime
import hashlib
import math
import os
import random
import secrets
from decimal import Decimal

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from config import container
from core.models import ParametroSistema
from core.repositories.base import EventoAuditoria
from core.security.privacy import cedula_hash, cedula_mascara
from core.utils.periodos import fin_de_periodo, sumar_meses
from modules.analitica.models import ConfiguracionAnalisis
from modules.campo.models import AsignacionZonaOficial, PosibleSocio, RutaVisita, RutaVisitaDetalle
from modules.cartera.esquemas_iniciales import ESQUEMAS_INICIALES
from modules.cartera.models import CargaDatos, Credito, EsquemaCarga, Pago, RegistroObservado, Socio
from modules.clasificacion.models import CategoriaClasificacion, VersionCriterio
from modules.territorio.models import Agencia, Ubicacion, Zona
from modules.usuarios.catalogo import MATRIZ, PERMISOS, ROLES
from modules.usuarios.models import Permiso, Rol, Usuario

PERIODOS = [sumar_meses("2026-05", i) for i in range(6)]  # 2026-05 … 2026-10
FUENTE_DEMO = "DEMO (sintético)"

AGENCIAS = [
    ("MATRIZ", "Agencia Matriz Loja", "Centro de Loja (dirección de demostración)", -3.9960, -79.2040),
    ("SUR", "Agencia Sur Loja", "Sur de Loja (dirección de demostración)", -4.0120, -79.2060),
    ("CATAMAYO", "Agencia Catamayo", "Catamayo (dirección de demostración)", -3.9870, -79.3560),
]

PARROQUIAS = [
    ("LOJ-SAG", "El Sagrario", "LOJ-LOJ", "MATRIZ"), ("LOJ-SUC", "Sucre", "LOJ-LOJ", "MATRIZ"), ("LOJ-VAL", "El Valle", "LOJ-LOJ", "MATRIZ"),
    ("LOJ-CAR", "Carigán", "LOJ-LOJ", "MATRIZ"), ("LOJ-SSB", "San Sebastián", "LOJ-LOJ", "SUR"), ("LOJ-PUN", "Punzara", "LOJ-LOJ", "SUR"),
    ("CAT-CAT", "Catamayo", "LOJ-CAT", "CATAMAYO"),
]

# código, parroquia, nombre, lat, lng, radio_m, hogares, perfil (socios base, mora base, tendencia mora, altas por mes)
BARRIOS = [
    ("LOJ-SAG-01", "LOJ-SAG", "Centro Histórico", -3.9968, -79.2018, 650, 1500, (150, 0.05, -0.002, 4)),
    ("LOJ-SAG-02", "LOJ-SAG", "Perpetuo Socorro", -3.9898, -79.2068, 600, 1100, (95, 0.06, 0.0, 3)),
    ("LOJ-SAG-03", "LOJ-SAG", "Las Peñas", -3.9928, -79.1975, 600, 900, (70, 0.07, 0.004, 2)),
    ("LOJ-SUC-01", "LOJ-SUC", "El Pedestal", -3.9945, -79.2135, 650, 1100, (105, 0.07, 0.002, 3)),
    ("LOJ-SUC-02", "LOJ-SUC", "Belén", -3.9818, -79.2148, 650, 1000, (80, 0.10, 0.006, 2)),
    ("LOJ-SUC-03", "LOJ-SUC", "Turunuma", -3.9885, -79.2215, 650, 1100, (85, 0.13, 0.008, 2)),
    ("LOJ-SUC-04", "LOJ-SUC", "Tierras Coloradas", -3.9768, -79.2240, 700, 1100, (45, 0.09, 0.003, 1)),
    ("LOJ-SUC-05", "LOJ-SUC", "Ciudad Victoria", -3.9852, -79.2300, 700, 1500, (22, 0.06, 0.0, 1)),
    ("LOJ-VAL-01", "LOJ-VAL", "Jipiro", -3.9800, -79.1998, 650, 1200, (110, 0.05, -0.003, 4)),
    ("LOJ-VAL-02", "LOJ-VAL", "El Valle", -3.9712, -79.1990, 650, 1100, (90, 0.08, 0.001, 3)),
    ("LOJ-VAL-03", "LOJ-VAL", "Las Pitas", -3.9688, -79.2068, 600, 800, (60, 0.11, -0.006, 2)),
    ("LOJ-VAL-04", "LOJ-VAL", "Motupe", -3.9585, -79.2035, 750, 1500, (50, 0.14, 0.007, 2)),
    ("LOJ-CAR-01", "LOJ-CAR", "Carigán", -3.9648, -79.2150, 700, 900, (38, 0.06, 0.0, 2)),
    ("LOJ-CAR-02", "LOJ-CAR", "Sauces Norte", -3.9545, -79.2112, 750, 1300, (18, 0.05, 0.0, 1)),
    ("LOJ-SSB-01", "LOJ-SSB", "La Tebaida", -4.0108, -79.2040, 650, 1100, (100, 0.06, 0.0, 3)),
    ("LOJ-SSB-02", "LOJ-SSB", "Zamora Huayco", -4.0030, -79.1918, 700, 1000, (55, 0.10, 0.005, 2)),
    ("LOJ-SSB-03", "LOJ-SSB", "Daniel Álvarez", -4.0062, -79.2085, 600, 950, (85, 0.07, -0.002, 3)),
    ("LOJ-SSB-04", "LOJ-SSB", "Época", -4.0165, -79.2108, 650, 1000, (60, 0.12, 0.004, 2)),
    ("LOJ-PUN-01", "LOJ-PUN", "Punzara", -4.0228, -79.2042, 700, 1000, (48, 0.09, 0.002, 2)),
    ("LOJ-PUN-02", "LOJ-PUN", "La Argelia", -4.0318, -79.2005, 750, 1100, (25, 0.05, 0.0, 1)),
    ("LOJ-PUN-03", "LOJ-PUN", "Capulí", -4.0200, -79.2175, 700, 1200, (20, 0.07, 0.0, 1)),
    ("CAT-CAT-01", "CAT-CAT", "Catamayo Centro", -3.9872, -79.3572, 800, 1200, (95, 0.07, 0.0, 3)),
    ("CAT-CAT-02", "CAT-CAT", "San José", -3.9818, -79.3488, 750, 800, (40, 0.11, 0.005, 1)),
    ("CAT-CAT-03", "CAT-CAT", "Trapichillo", -3.9938, -79.3660, 800, 1000, (20, 0.08, 0.0, 1)),
]

USUARIOS = [
    ("admin", "María Fernanda Ochoa", "Administradora de la plataforma", "admin", None, True),
    ("gerencia", "Jorge Eduardo Castillo", "Gerente general", "gerencia", None, True),
    ("jefe", "Carlos Jaramillo Ruiz", "Jefe de Agencia Matriz", "jefe_agencia", "MATRIZ", True),
    ("jefesur", "Patricia Torres Vivanco", "Jefa de Agencia Sur", "jefe_agencia", "SUR", True),
    ("oficial", "Diana Cueva Sarmiento", "Oficial de crédito", "oficial", "MATRIZ", True),
    ("oficial2", "Luis Armijos Paredes", "Oficial de crédito", "oficial", "MATRIZ", True),
    ("oficial3", "Andrea Granda León", "Oficial de crédito", "oficial", "SUR", True),
    ("supervisor", "Ramiro Espinosa Celi", "Supervisor de apoyo metodológico", "supervisor", None, True),
    ("metodologia", "Gabriela Riofrío Mora", "Jefa de metodología de crédito", "metodologia", None, True),
    ("pvalarezo", "Pablo Valarezo Ortiz", "Oficial de crédito (cuenta desactivada)", "oficial", "MATRIZ", False),
]

NOMBRES = ["José", "María", "Luis", "Carmen", "Jorge", "Rosa", "Manuel", "Lucía", "Segundo", "Gloria", "Diego", "Verónica", "Wilson",
           "Paola", "Ángel", "Fanny", "Byron", "Jenny", "Fausto", "Mercedes", "Milton", "Ximena", "Holger", "Karina"]
APELLIDOS = ["Jaramillo", "Ordóñez", "Cueva", "Armijos", "Castillo", "Granda", "Sarmiento", "Riofrío", "Torres", "Valarezo", "Espinosa",
             "Celi", "Ochoa", "Paredes", "Vivanco", "Guamán", "Quezada", "Aguirre", "Chamba", "Tandazo", "Loaiza", "Merino"]

CRITERIOS = [
    (1, "anterior", "DEMO — Primera versión de demostración (umbrales no oficiales).", [
        ("Seguimiento de cartera", "#C8341C", 1, 7, "Morosidad por encima del umbral de demostración.", [("tasa_morosidad", ">=", 12)]),
        ("Oportunidad comercial", "#E8920C", 2, 10, "Baja presencia de socios frente a los hogares.", [("penetracion_pct", "<", 3)]),
        ("Zona consolidada", "#2E9E6B", 3, 30, "Presencia consolidada y cartera sana.", [("penetracion_pct", ">=", 3)]),
    ]),
    (2, "vigente", "DEMO — Agrega posicionamiento y baja el umbral de mora a 10 % (umbrales no oficiales).", [
        ("Seguimiento de cartera", "#C8341C", 1, 7, "Morosidad alta: priorizar gestión de cobro.", [("tasa_morosidad", ">=", 10)]),
        ("Oportunidad comercial", "#E8920C", 2, 10, "Muy baja presencia de socios: captar nuevos socios y negocios.", [("penetracion_pct", "<", 4)]),
        ("Fortalecer posicionamiento", "#1F70C4", 3, 15, "Presencia intermedia y cartera sana: ampliar colocación.",
         [("penetracion_pct", "<", 8), ("tasa_morosidad", "<", 10)]),
        ("Zona consolidada", "#2E9E6B", 4, 30, "Presencia alta y cartera sana: mantener la relación.", [("penetracion_pct", ">=", 8)]),
    ]),
]

PROSPECTOS = [
    ("Tienda de abarrotes El Pino", "Junto al parque", "Comercio minorista", "LOJ-SUC-05", 0.0011, -0.0009, "oficial"),
    ("Taller de costura Hilos de Oro", "Frente a la escuela", "Confección", "LOJ-CAR-02", -0.0010, 0.0012, "oficial"),
    ("Panadería La Espiga", "Esquina principal", "Alimentos", "LOJ-SUC-04", 0.0008, 0.0006, "oficial"),
    ("Ferretería Don Lucho", "Vía principal", "Ferretería", "LOJ-VAL-04", -0.0012, -0.0007, "oficial"),
    ("Cyber y papelería Mundo Net", "Cerca del mercado", "Servicios", "LOJ-SAG-03", 0.0006, 0.0010, "oficial2"),
    ("Mecánica Automotriz Rueda", "Salida norte", "Mecánica", "LOJ-CAR-01", 0.0009, -0.0011, "oficial2"),
    ("Restaurante Sabor Lojano", "Calle peatonal", "Alimentos", "LOJ-SUC-03", -0.0007, 0.0009, "oficial2"),
    ("Floristería Primavera", "Junto a la iglesia", "Comercio minorista", "LOJ-PUN-03", 0.0010, 0.0008, "oficial3"),
    ("Carpintería El Roble", "Barrio alto", "Manufactura", "LOJ-PUN-02", -0.0011, -0.0006, "oficial3"),
    ("Bazar La Economía", "Plaza central", "Comercio minorista", "LOJ-SSB-04", 0.0007, -0.0010, "oficial3"),
]

ASIGNACIONES = {
    "oficial": ["LOJ-SAG-03", "LOJ-SUC-03", "LOJ-SUC-04", "LOJ-SUC-05", "LOJ-VAL-04", "LOJ-CAR-02"],
    "oficial2": ["LOJ-SAG-01", "LOJ-SAG-02", "LOJ-SUC-01", "LOJ-SUC-02", "LOJ-VAL-01", "LOJ-VAL-02", "LOJ-VAL-03", "LOJ-CAR-01"],
    "oficial3": ["LOJ-SSB-01", "LOJ-SSB-02", "LOJ-SSB-03", "LOJ-SSB-04", "LOJ-PUN-01", "LOJ-PUN-02", "LOJ-PUN-03"],
}


class Command(BaseCommand):
    help = "Carga datos de demostración sintéticos (idempotente)."

    def handle(self, *args, **opts):
        if not settings.DEBUG and os.environ.get("ALLOW_SEED") != "1":
            raise CommandError("El seed solo se ejecuta en desarrollo (DEBUG=True) o con ALLOW_SEED=1 de forma explícita.")
        self.creado = []
        with transaction.atomic():
            self._permisos_roles()
            ParametroSistema.actual()
            self._agencias()
            self._zonas()
            password = self._usuarios()
            self._esquemas()
        admin = Usuario.objects.get(username="admin")
        with transaction.atomic():
            if not CargaDatos.objects.filter(es_seed=True, tipo="socios").exists():
                self._datos_financieros(admin)
            self._observados(admin)
            self._criterios()
            self._campo(admin)
            self._analitica(admin)
        if self.creado:
            container.auditoria().registrar(EventoAuditoria(
                categoria="configuracion", accion="seed_ejecutado", entidad_afectada="Sistema",
                detalle="Datos de demostración sintéticos cargados: " + ", ".join(self.creado), usuario_id=admin.id, username=admin.username,
            ))
        self.stdout.write(self.style.SUCCESS("Seed completado. Nuevos: " + (", ".join(self.creado) or "nada (ya existía todo)")))
        if password:
            self.stdout.write(self.style.WARNING(
                "\nContraseña de las cuentas demo (se muestra UNA sola vez; cámbiela): " + password + "\n"
                "Usuarios: " + ", ".join(u[0] for u in USUARIOS if u[5]) + " (pvalarezo está desactivada)."
            ))

    # ---------------------------------------------------------------------
    def _permisos_roles(self):
        for codigo, desc, grupo in PERMISOS:
            Permiso.objects.update_or_create(codigo=codigo, defaults={"descripcion": desc, "grupo": grupo})
        for codigo, nombre in ROLES.items():
            rol, creado = Rol.objects.get_or_create(codigo=codigo, defaults={"nombre": nombre})
            if creado:
                rol.permisos.set(Permiso.objects.filter(codigo__in=MATRIZ[codigo]))
                self.creado.append(f"rol {codigo}")

    def _agencias(self):
        for codigo, nombre, direccion, lat, lng in AGENCIAS:
            _, c = Agencia.objects.get_or_create(codigo=codigo, defaults={"nombre": nombre, "direccion": direccion, "ubicacion": Point(lng, lat, srid=4326)})
            if c:
                self.creado.append(f"agencia {codigo}")

    def _zonas(self):
        ag = {a.codigo: a for a in Agencia.objects.all()}
        prov, c = Zona.objects.get_or_create(codigo="LOJ", defaults={"nombre": "Loja", "tipo_zona": "provincia", "fuente_oficial": FUENTE_DEMO})
        cantones = {}
        for cod, nombre in (("LOJ-LOJ", "Loja"), ("LOJ-CAT", "Catamayo")):
            cantones[cod], _ = Zona.objects.get_or_create(codigo=cod, defaults={"nombre": nombre, "tipo_zona": "canton", "zona_superior": prov, "fuente_oficial": FUENTE_DEMO})
        parroquias = {}
        for cod, nombre, canton, agencia in PARROQUIAS:
            parroquias[cod], _ = Zona.objects.get_or_create(codigo=cod, defaults={
                "nombre": nombre, "tipo_zona": "parroquia", "zona_superior": cantones[canton], "agencia": ag[agencia], "fuente_oficial": FUENTE_DEMO})
        nuevos = 0
        for cod, parr, nombre, lat, lng, _, hogares, _ in BARRIOS:
            _, c = Zona.objects.get_or_create(codigo=cod, defaults={
                "nombre": nombre, "tipo_zona": "barrio", "zona_superior": parroquias[parr], "agencia": parroquias[parr].agencia,
                "centroide": Point(lng, lat, srid=4326), "hogares_estimados": hogares, "fuente_oficial": FUENTE_DEMO})
            nuevos += c
        if Zona.objects.filter(tipo_zona="barrio", poligono__isnull=True).exists():
            self._geometrias()
        if nuevos:
            self.creado.append(f"{nuevos} barrios sintéticos")

    def _geometrias(self):
        """Polígonos esquemáticos: celdas de Voronoi por cantón recortadas por un círculo alrededor de cada centroide."""
        radios = {b[0]: b[5] * 1.6 for b in BARRIOS}
        with connection.cursor() as cur:
            for canton in ("LOJ-", "CAT-"):
                cur.execute("""
                    WITH b AS (SELECT id, codigo, centroide FROM zona WHERE tipo_zona = 'barrio' AND codigo LIKE %s),
                    cells AS (SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(centroide), 0, ST_Expand(ST_Envelope(ST_Collect(centroide)), 0.05)))).geom AS g FROM b)
                    SELECT b.codigo, ST_AsText(c.g) FROM b JOIN cells c ON ST_Contains(c.g, b.centroide)
                """, [canton + "%"])
                for codigo, celda in cur.fetchall():
                    cur.execute("""
                        UPDATE zona SET poligono = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Intersection(
                            ST_GeomFromText(%s, 4326), ST_Buffer(centroide::geography, %s, 24)::geometry)), 3))
                        WHERE codigo = %s
                    """, [celda, radios[codigo], codigo])
            for tipo in ("parroquia", "canton", "provincia"):
                cur.execute("""
                    UPDATE zona p SET poligono = sub.g, centroide = ST_PointOnSurface(sub.g) FROM (
                        SELECT h.zona_superior_id AS pid, ST_Multi(ST_Union(h.poligono)) AS g FROM zona h
                        WHERE h.poligono IS NOT NULL GROUP BY h.zona_superior_id
                    ) sub WHERE p.id = sub.pid AND p.tipo_zona = %s
                """, [tipo])

    def _usuarios(self):
        faltan = [u for u in USUARIOS if not Usuario.objects.filter(username__iexact=u[0]).exists()]
        if not faltan:
            return None
        password = os.environ.get("SEED_DEMO_PASSWORD") or ("Demo-" + secrets.token_urlsafe(9))
        roles = {r.codigo: r for r in Rol.objects.all()}
        ag = {a.codigo: a for a in Agencia.objects.all()}
        for username, nombre, cargo, rol, agencia, activo in faltan:
            u = Usuario(username=username, nombre_completo=nombre, cargo=cargo, rol=roles[rol], agencia=ag.get(agencia), activo=activo,
                        email=f"{username}@demo.invalid")
            u.set_password(password)
            u.save()
        self.creado.append(f"{len(faltan)} usuarios demo")
        return None if os.environ.get("SEED_DEMO_PASSWORD") else password

    def _esquemas(self):
        for tipo, campos in ESQUEMAS_INICIALES.items():
            if not EsquemaCarga.objects.filter(tipo=tipo).exists():
                EsquemaCarga.objects.create(tipo=tipo, version=1, vigente=True, campos=campos)
                self.creado.append(f"esquema {tipo} v1")

    # ---------------------------------------------------------------------
    def _carga(self, admin, tipo, periodo, n):
        nombre = f"seed_{tipo}_{periodo}.csv"
        c, _ = CargaDatos.objects.get_or_create(
            nombre_archivo=nombre, tipo=tipo, periodo=periodo, es_seed=True,
            defaults={"hash_archivo": hashlib.sha256(nombre.encode()).hexdigest(), "usuario": admin, "estado": "completada", "leidos": n, "cargados": n,
                      "confirmada_en": datetime.datetime.combine(fin_de_periodo(periodo), datetime.time(18, 0), tzinfo=datetime.timezone.utc),
                      "esquema": EsquemaCarga.objects.get(tipo=tipo, vigente=True), "mensaje": "Carga de demostración (sintética)."},
        )
        return c

    def _puntos(self, zona, n, semilla):
        with connection.cursor() as cur:
            cur.execute("SELECT ST_X(g), ST_Y(g) FROM (SELECT (ST_Dump(ST_GeneratePoints(poligono, %s, %s))).geom AS g FROM zona WHERE id = %s) s",
                        [n, semilla, zona.id])
            return [(round(y, 6), round(x, 6)) for x, y in cur.fetchall()]

    def _datos_financieros(self, admin):
        rnd = random.Random(20260501)
        zonas = {z.codigo: z for z in Zona.objects.filter(tipo_zona="barrio")}
        cargas = {(t, p): self._carga(admin, t, p, 0) for t in ("socios", "creditos", "pagos") for p in PERIODOS}
        usados, sid, cid = set(), 10000, 50000
        socios = []
        for idx, (cod, _parr, _nombre, _lat, _lng, _radio, _hogares, (base, mora, tend, altas)) in enumerate(BARRIOS):
            z = zonas[cod]
            ingresos = [datetime.date(2022, 1, 1) + datetime.timedelta(days=rnd.randint(0, 1550)) for _ in range(base)]
            for per in PERIODOS:
                n = max(0, round(altas + rnd.gauss(0, 1.1)))
                y, m = map(int, per.split("-"))
                ingresos += [datetime.date(y, m, rnd.randint(1, 27)) for _ in range(n)]
            puntos = self._puntos(z, len(ingresos), 1000 + idx)
            for fecha, (plat, plng) in zip(ingresos, puntos):
                while True:
                    ced = "11" + str(rnd.randint(0, 10**8 - 1)).zfill(8)
                    if ced not in usados:
                        usados.add(ced)
                        break
                nombre_s = f"{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)} {rnd.choice(APELLIDOS)}"
                periodo_carga = max(PERIODOS[0], f"{fecha.year:04d}-{fecha.month:02d}")
                socios.append({"codigo": f"S-{sid}", "ced": ced, "nombre": nombre_s, "fecha": fecha, "lat": plat, "lng": plng, "zona": z,
                               "carga": cargas[("socios", periodo_carga)], "perfil": (mora, tend)})
                sid += 1
        ubics = Ubicacion.objects.bulk_create([Ubicacion(punto=Point(s["lng"], s["lat"], srid=4326), latitud=Decimal(str(s["lat"])),
                                                         longitud=Decimal(str(s["lng"])), zona=s["zona"]) for s in socios], batch_size=1000)
        objs = Socio.objects.bulk_create([
            Socio(codigo_socio=s["codigo"], cedula_hash=cedula_hash(s["ced"]), cedula_mascara=cedula_mascara(s["ced"]), nombre=s["nombre"],
                  agencia=s["zona"].agencia, zona=s["zona"], ubicacion=u, fecha_ingreso=s["fecha"], carga=s["carga"],
                  rango_ingreso=rnd.choice(["0-500", "500-1000", "1000-2000", "2000+"]))
            for s, u in zip(socios, ubics)
        ], batch_size=1000)
        creditos, perfiles = [], []
        ultimo = fin_de_periodo(PERIODOS[-1])
        for s, so in zip(socios, objs):
            if rnd.random() >= 0.62:
                continue
            desde = max(s["fecha"], datetime.date(2024, 1, 1))
            span = max(0, (ultimo - desde).days)
            desembolso = desde + datetime.timedelta(days=rnd.randint(0, span))
            plazo = rnd.choice([12, 18, 24, 36, 48])
            monto = min(Decimal(40000), max(Decimal(500), Decimal(round(math.exp(math.log(4800) + rnd.gauss(0, 0.7)) / 50) * 50)))
            fin_plazo = desembolso + datetime.timedelta(days=30 * plazo)
            estado = "cancelado" if fin_plazo < ultimo else ("vencido" if rnd.random() < 0.03 else "vigente")
            per = max(PERIODOS[0], f"{desembolso.year:04d}-{desembolso.month:02d}")
            creditos.append(Credito(codigo_credito=f"C-{cid}", socio=so, zona=s["zona"], monto=monto, fecha_desembolso=desembolso, plazo_meses=plazo,
                                    estado=estado, carga=cargas[("creditos", per)]))
            perfiles.append(s["perfil"])
            cid += 1
        creditos = Credito.objects.bulk_create(creditos, batch_size=1000)
        pagos = []
        for c, (mora, tend) in zip(creditos, perfiles):
            previo_atrasado = False
            for k, per in enumerate(PERIODOS):
                fin = fin_de_periodo(per)
                if c.fecha_desembolso > fin or (fin - c.fecha_desembolso).days > 30 * c.plazo_meses:
                    continue
                prob = 0.42 if previo_atrasado else min(0.3, max(0.01, mora * 0.62 + tend * k * 0.8))
                atrasado = rnd.random() < prob
                previo_atrasado = atrasado
                cuota = (c.monto / c.plazo_meses).quantize(Decimal("0.01"))
                # saldo pendiente sintético de un crédito en mora: fracción del capital aún no amortizado
                transcurridos = max(0, (fin - c.fecha_desembolso).days // 30)
                capital = c.monto * Decimal(max(0.1, 1 - transcurridos / c.plazo_meses))
                pagos.append(Pago(credito=c, periodo=per, fecha_pago=None if atrasado else fin - datetime.timedelta(days=rnd.randint(0, 20)),
                                  valor_pagado=Decimal(0) if atrasado else cuota,
                                  valor_pendiente=(capital * Decimal(str(round(0.55 + rnd.random() * 0.45, 3)))).quantize(Decimal("0.01")) if atrasado else Decimal(0),
                                  dias_atraso=math.ceil((rnd.random() ** 1.6) * 120) if atrasado else 0, carga=cargas[("pagos", per)]))
        Pago.objects.bulk_create(pagos, batch_size=2000)
        for (tipo, _per), carga in cargas.items():
            n = {"socios": Socio, "creditos": Credito, "pagos": Pago}[tipo].objects.filter(carga=carga).count()
            CargaDatos.objects.filter(id=carga.id).update(leidos=n, cargados=n, resumen={"nuevos": n, "actualizados": 0, "sin_cambio": 0, "observados": 0, "rechazados": 0})
        container.servicio_indicadores().recalcular(PERIODOS, None)
        self.creado.append(f"{len(objs)} socios, {len(creditos)} créditos y {len(pagos)} pagos sintéticos en {len(PERIODOS)} períodos")

    def _observados(self, admin):
        if RegistroObservado.objects.filter(carga__es_seed=True).exists():
            return
        carga = self._carga(admin, "socios", PERIODOS[-1], 0)
        filas = [
            ({"codigo_socio": "S-90001", "cedula": cedula_mascara("1104587236"), "nombre": "Rocío Quezada Chamba", "agencia_codigo": "MATRIZ",
              "fecha_ingreso": "2026-10-04", "latitud": "", "longitud": ""}, [{"campo": "latitud", "motivo": "Sin ubicación válida: Sin coordenadas"}]),
            ({"codigo_socio": "S-90002", "cedula": "", "nombre": "Holger Tandazo Merino", "agencia_codigo": "MATRIZ", "fecha_ingreso": "2026-10-08",
              "latitud": "-3.980500", "longitud": "-79.200200"}, [{"campo": "cedula", "motivo": "Falta el dato obligatorio «Cédula»"}]),
            ({"codigo_socio": "S-10005", "cedula": cedula_mascara("1100000077"), "nombre": "Registro repetido", "agencia_codigo": "SUR",
              "fecha_ingreso": "2026-10-11", "latitud": "-4.010800", "longitud": "-79.204000"}, [{"campo": "codigo_socio", "motivo": "Registro repetido en el archivo (código de socio)"}]),
            ({"codigo_socio": "S-90004", "cedula": cedula_mascara("1104000123"), "nombre": "Ximena Loaiza Celi", "agencia_codigo": "CATAMAYO",
              "fecha_ingreso": "2026-10-15", "latitud": "-3.5", "longitud": "-79.1"}, [{"campo": "latitud", "motivo": "Sin ubicación válida: Precisión insuficiente (mínimo 4 decimales)"}]),
        ]
        RegistroObservado.objects.bulk_create([
            RegistroObservado(carga=carga, tipo="socios", periodo=PERIODOS[-1], numero_fila=i + 2, fila_raw=f, motivos=m,
                              datos={"_fila": {k: v for k, v in f.items() if k != "cedula"}})
            for i, (f, m) in enumerate(filas)
        ])
        CargaDatos.objects.filter(id=carga.id).update(observados=len(filas))
        self.creado.append(f"{len(filas)} registros observados pendientes")

    def _criterios(self):
        if VersionCriterio.objects.exists():
            return
        autor = Usuario.objects.get(username="metodologia")
        ahora = datetime.datetime.now(datetime.timezone.utc)
        for version, estado, nota, cats in CRITERIOS:
            v = VersionCriterio.objects.create(version=version, estado=estado, nota=nota, creado_por=autor, aprobado_por=autor, aprobado_en=ahora)
            for nombre, color, prioridad, frecuencia, desc, reglas in cats:
                CategoriaClasificacion.objects.create(version=v, nombre=nombre, color_hex=color, prioridad=prioridad, frecuencia_visita_dias=frecuencia,
                                                      descripcion=desc, reglas=[{"variable": a, "operador": o, "umbral": float(u)} for a, o, u in reglas])
        container.servicio_clasificacion().recalcular_periodos(PERIODOS)
        self.creado.append("criterios v1 (anterior) y v2 (vigente) DEMO")

    def _campo(self, admin):
        zonas = {z.codigo: z for z in Zona.objects.filter(tipo_zona="barrio")}
        jefes = {"MATRIZ": Usuario.objects.get(username="jefe"), "SUR": Usuario.objects.get(username="jefesur")}
        if not AsignacionZonaOficial.objects.exists():
            for username, codigos in ASIGNACIONES.items():
                of = Usuario.objects.get(username=username)
                for cod in codigos:
                    AsignacionZonaOficial.objects.create(oficial=of, zona=zonas[cod], asignado_por=jefes[of.agencia.codigo])
            self.creado.append("asignaciones de zonas")
        if not PosibleSocio.objects.exists():
            for nombre, ref, act, cod, dlat, dlng, user in PROSPECTOS:
                z = zonas[cod]
                lat, lng = round(z.centroide.y + dlat, 6), round(z.centroide.x + dlng, 6)
                u = Ubicacion.objects.create(punto=Point(lng, lat, srid=4326), latitud=Decimal(str(lat)), longitud=Decimal(str(lng)), zona=z)
                PosibleSocio.objects.create(nombre_negocio=nombre, referencia=ref, actividad=act, ubicacion=u, zona=z,
                                            registrado_por=Usuario.objects.get(username=user), observacion="Registro de demostración")
            self.creado.append(f"{len(PROSPECTOS)} posibles socios")
        if not RutaVisita.objects.exists():
            of = Usuario.objects.get(username="oficial")
            r = RutaVisita.objects.create(nombre="Recorrido de captación — demostración", oficial=of, fecha_prevista=datetime.date(2026, 11, 24))
            for i, cod in enumerate(["LOJ-SUC-03", "LOJ-VAL-04", "LOJ-SUC-05"]):
                RutaVisitaDetalle.objects.create(ruta=r, orden=i + 1, zona=zonas[cod])
            self.creado.append("ruta de demostración")

    def _analitica(self, admin):
        if not ConfiguracionAnalisis.objects.exists():
            ConfiguracionAnalisis.objects.create(version=1, vigente=True, min_periodos=3, responsable=admin,
                                                 nota="DEMO — pesos de demostración, no validados por la cooperativa.",
                                                 pesos={"penetracion_baja": "3", "hogares": "1", "crecimiento": "2", "prospectos": "2", "mora_baja": "2"})
            self.creado.append("configuración analítica DEMO v1")
