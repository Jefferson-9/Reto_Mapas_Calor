"""Trigger que impide modificar o borrar el historial (RF-006.05)."""

from django.db import migrations

SQL = """
CREATE OR REPLACE FUNCTION historial_cambios_inmutable() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'TRUNCATE' AND current_setting('coac.permitir_purga_pruebas', true) = 'on' THEN
        RETURN NULL;  -- solo el entorno de pruebas habilita vaciar la tabla entre casos
    END IF;
    RAISE EXCEPTION 'historial_cambios es inmutable: operación % no permitida', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER historial_cambios_no_update_delete
    BEFORE UPDATE OR DELETE ON historial_cambios
    FOR EACH ROW EXECUTE FUNCTION historial_cambios_inmutable();

CREATE TRIGGER historial_cambios_no_truncate
    BEFORE TRUNCATE ON historial_cambios
    FOR EACH STATEMENT EXECUTE FUNCTION historial_cambios_inmutable();
"""

REVERSE = """
DROP TRIGGER IF EXISTS historial_cambios_no_truncate ON historial_cambios;
DROP TRIGGER IF EXISTS historial_cambios_no_update_delete ON historial_cambios;
DROP FUNCTION IF EXISTS historial_cambios_inmutable();
"""


class Migration(migrations.Migration):
    dependencies = [("auditoria", "0001_initial")]
    operations = [migrations.RunSQL(SQL, REVERSE)]
