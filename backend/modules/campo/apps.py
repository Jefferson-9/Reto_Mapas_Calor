from django.apps import AppConfig


class CampoConfig(AppConfig):
    name = "modules.campo"
    label = "campo"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        # Proveedor de zonas asignadas para el ámbito de los oficiales (core no depende de este módulo)
        from core.security.scope import registrar_proveedor_zonas_asignadas
        from modules.campo.repositories.campo import PostgresCampoRepository

        registrar_proveedor_zonas_asignadas(lambda usuario_id: PostgresCampoRepository().zonas_activas(usuario_id))
