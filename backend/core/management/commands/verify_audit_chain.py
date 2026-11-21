from django.core.management.base import BaseCommand, CommandError

from config.container import auditoria


class Command(BaseCommand):
    help = "Verifica la integridad de la cadena de hash del historial de cambios."

    def handle(self, *args, **opts):
        r = auditoria().verificar_cadena()
        if r["integra"]:
            self.stdout.write(self.style.SUCCESS(f"Cadena íntegra: {r['total']} eventos verificados."))
        else:
            raise CommandError(f"Cadena alterada en la secuencia {r['secuencia_error']}: {r['motivo']}")
