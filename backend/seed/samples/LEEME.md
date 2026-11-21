# Archivos de ejemplo (sintéticos)

Datos inventados para probar el flujo de carga. Ninguna cédula, nombre o cifra es real.

| Archivo | Tipo | Qué prueba |
|---|---|---|
| `socios_validos.csv` | socios | 5 filas válidas en Loja y Catamayo (fecha `DD/MM/AAAA` incluida). |
| `socios_con_errores.csv` | socios | Separador `;`, encabezados con alias y tildes (`cédula`, `nombres`, `lat`, `lng`); filas sin coordenadas, código repetido, sin cédula, fecha inválida (rechazada), fuera de zonas, poca precisión y agencia inexistente. |
| `socios_columna_faltante.csv` | socios | Falta `codigo_socio`: se asigna a mano (`id_cliente`) en la previsualización y se puede guardar como alias. |
| `creditos_ejemplo.csv` | créditos | Cargar después de `socios_validos.csv`: socio inexistente (observado), monto no numérico y estado inválido (rechazados). |
| `pagos_ejemplo.csv` | pagos | Período 2026-11: crédito inexistente (observado) y fila de otro período (observada). |
| `limites_ejemplo.geojson` | límites | Agrega un barrio esquemático en El Valle (vista previa → confirmar). |
