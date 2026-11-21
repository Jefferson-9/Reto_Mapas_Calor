from abc import ABC, abstractmethod

from django.forms.models import model_to_dict

from core.models import ParametroSistema

CAMPOS = [
    "habilitar_modo_offline", "horas_ventana_offline", "habilitar_registro_visitas", "habilitar_analisis_predictivo",
    "habilitar_conexion_bd", "minutos_inactividad_sesion", "dias_atraso_minimo", "bandas_potencial", "max_mb_carga",
    "max_filas_carga", "tamano_lote", "decimales_minimos_coordenada", "tamano_pagina", "max_puntos_mapa",
]


class IParametrosRepository(ABC):
    @abstractmethod
    def obtener(self) -> dict: ...

    @abstractmethod
    def actualizar(self, cambios: dict, usuario_id) -> dict: ...


class PostgresParametrosRepository(IParametrosRepository):
    def obtener(self):
        p = ParametroSistema.actual()
        data = model_to_dict(p, fields=CAMPOS)
        data["updated_at"] = p.updated_at
        return data

    def actualizar(self, cambios, usuario_id):
        p = ParametroSistema.objects.select_for_update().get_or_create(id=1)[0]
        for k, v in cambios.items():
            setattr(p, k, v)
        p.actualizado_por_id = usuario_id
        p.save()
        return self.obtener()
