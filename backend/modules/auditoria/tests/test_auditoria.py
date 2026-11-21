import threading

import pytest
from django.db import connection, transaction
from django.db.utils import DatabaseError

from config.container import auditoria
from core.repositories.base import EventoAuditoria
from modules.auditoria.models import HistorialCambios
from modules.auditoria.services.cadena import calcular_hash, verificar


def _evento(n=0, **kw):
    return EventoAuditoria(categoria="datos", accion="prueba", entidad_afectada="X", detalle=f"evento {n}", **kw)


@pytest.mark.django_db
class TestCadena:
    def test_encadena_y_verifica(self, base):
        svc = auditoria()
        for i in range(5):
            svc.registrar(_evento(i, valor_nuevo={"monto": "10.50", "n": i}))
        r = svc.verificar_cadena()
        assert r["integra"] and r["total"] == 5
        filas = list(HistorialCambios.objects.order_by("secuencia").values("secuencia", "prev_hash", "hash"))
        assert all(filas[i]["prev_hash"] == filas[i - 1]["hash"] for i in range(1, 5))

    def test_trigger_bloquea_update_delete_y_truncate(self, base):
        auditoria().registrar(_evento())
        for sql in ("UPDATE historial_cambios SET detalle = 'alterado'", "DELETE FROM historial_cambios"):
            with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
                cur.execute(sql)
        with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cur:
            cur.execute("SET LOCAL coac.permitir_purga_pruebas = 'off'")
            cur.execute("TRUNCATE historial_cambios CASCADE")
        assert HistorialCambios.objects.count() == 1

    def test_detecta_alteracion_borrado_y_reordenamiento(self, base):
        svc = auditoria()
        for i in range(4):
            svc.registrar(_evento(i))
        regs = list(svc.repo.iterar_ordenado())
        alterado = [dict(r) for r in regs]
        alterado[1]["detalle"] = "manipulado"
        assert verificar(alterado)["motivo"] == "Contenido alterado (hash no coincide)"
        assert not verificar(regs[:1] + regs[2:])["integra"]  # borrado intermedio
        reordenado = [regs[0], regs[2], regs[1], regs[3]]
        assert not verificar(reordenado)["integra"]
        # recalcular el hash de un registro alterado no basta: rompe el encadenamiento siguiente
        alterado[1]["hash"] = calcular_hash(alterado[1])
        assert verificar(alterado)["secuencia_error"] == 3

    def test_api_historial_filtra_y_es_solo_lectura(self, api, base):
        cli = api("admin")
        r = cli.get("/api/v1/historial/?categoria=acceso&usuario=admin")
        assert r.status_code == 200 and all(i["categoria"] == "acceso" for i in r.json()["data"]["items"])
        assert cli.delete("/api/v1/historial/").status_code == 405
        assert api("jefe").get("/api/v1/historial/").status_code == 403
        assert cli.get("/api/v1/historial/verificar/").json()["data"]["integra"] is True


@pytest.mark.django_db(transaction=True)
def test_secuencia_segura_bajo_concurrencia(base):
    errores = []

    def trabajo(i):
        try:
            auditoria().registrar(_evento(i))
        except Exception as e:  # se reporta en la aserción
            errores.append(e)
        finally:
            connection.close()

    hilos = [threading.Thread(target=trabajo, args=(i,)) for i in range(12)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert not errores
    secuencias = sorted(HistorialCambios.objects.values_list("secuencia", flat=True))
    assert secuencias == list(range(1, len(secuencias) + 1))
    assert auditoria().verificar_cadena()["integra"]
