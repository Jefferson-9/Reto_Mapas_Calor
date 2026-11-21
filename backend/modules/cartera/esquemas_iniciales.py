"""Propuesta inicial de esquemas de carga (sección 6.3). Supuesto a validar con la cooperativa."""


def _c(campo, etiqueta, tipo_dato, requerido=True, nucleo=True, sensible=False, alias=()):
    return {"campo": campo, "etiqueta": etiqueta, "tipo_dato": tipo_dato, "requerido": requerido, "nucleo": nucleo,
            "sensible": sensible, "alias": list(alias)}


ESQUEMAS_INICIALES = {
    "socios": [
        _c("codigo_socio", "Código de socio", "texto", alias=["id_socio", "socio", "codigo", "cod_socio"]),
        _c("cedula", "Cédula", "texto", sensible=True, alias=["identificacion", "ci", "documento", "cedula_identidad"]),
        _c("nombre", "Nombre", "texto", alias=["nombres", "nombre_completo", "apellidos_nombres"]),
        _c("agencia_codigo", "Código de agencia", "texto", alias=["agencia", "cod_agencia", "oficina"]),
        _c("fecha_ingreso", "Fecha de ingreso", "fecha", alias=["ingreso", "fecha_afiliacion", "fecha_apertura"]),
        _c("latitud", "Latitud", "numero", alias=["lat", "latitude", "y"]),
        _c("longitud", "Longitud", "numero", alias=["lng", "lon", "long", "longitude", "x"]),
        _c("rango_ingreso", "Rango de ingreso", "texto", requerido=False, nucleo=False, alias=["ingreso_mensual", "rango_ingresos"]),
        _c("direccion", "Dirección", "texto", requerido=False, nucleo=False, alias=["domicilio", "direccion_domicilio"]),
    ],
    "creditos": [
        _c("codigo_credito", "Código de crédito", "texto", alias=["id_credito", "credito", "operacion", "num_operacion"]),
        _c("codigo_socio", "Código de socio", "texto", alias=["id_socio", "socio", "cod_socio"]),
        _c("monto", "Monto", "numero", alias=["monto_desembolsado", "valor", "capital"]),
        _c("fecha_desembolso", "Fecha de desembolso", "fecha", alias=["desembolso", "fecha_concesion"]),
        _c("plazo_meses", "Plazo (meses)", "entero", alias=["plazo", "meses"]),
        _c("estado", "Estado", "texto", alias=["estado_credito", "situacion"]),
    ],
    "pagos": [
        _c("codigo_credito", "Código de crédito", "texto", alias=["id_credito", "credito", "operacion"]),
        _c("periodo", "Período", "texto", alias=["mes", "periodo_pago"]),
        _c("valor_pagado", "Valor pagado", "numero", alias=["pagado", "monto_pagado"]),
        _c("valor_pendiente", "Valor pendiente", "numero", alias=["pendiente", "saldo_vencido", "saldo_pendiente"]),
        _c("dias_atraso", "Días de atraso", "entero", alias=["dias", "dias_mora", "atraso"]),
        _c("fecha_pago", "Fecha de pago", "fecha", requerido=False, nucleo=False, alias=["fecha"]),
    ],
    "limites": [
        _c("codigo", "Código de zona", "texto", alias=["cod", "id_zona", "codigo_zona"]),
        _c("nombre", "Nombre", "texto", alias=["name", "nombre_zona"]),
        _c("tipo_zona", "Tipo de zona", "texto", alias=["tipo", "nivel"]),
        _c("zona_superior_codigo", "Código de zona superior", "texto", requerido=False, alias=["padre", "superior", "codigo_padre"]),
        _c("hogares_estimados", "Hogares estimados", "entero", requerido=False, nucleo=False, alias=["hogares", "viviendas"]),
        _c("fuente_oficial", "Fuente", "texto", requerido=False, nucleo=False, alias=["fuente", "source"]),
        _c("agencia_codigo", "Código de agencia", "texto", requerido=False, nucleo=False, alias=["agencia"]),
    ],
}

EJEMPLOS = {
    "socios": ["S-0001", "1100000001", "Nombre Apellido", "MATRIZ", "2026-01-15", "-3.996800", "-79.201800", "500-1000", "Calle 1"],
    "creditos": ["C-0001", "S-0001", "4800.00", "2026-02-01", "24", "vigente"],
    "pagos": ["C-0001", "2026-10", "210.50", "0.00", "0", "2026-10-05"],
}
