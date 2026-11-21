# Reto_Mapas_Calor

**Plataforma de análisis geoespacial y mapas de calor — Cooperativa de Ahorro y Crédito Padre Julián Lorente (Loja, Ecuador).**
Equipo: Grupo 5 (Nayeli Castillo, Jefferson Sánchez, Adrián Valverde, Nicole Zapata).

<details>
<summary><strong>Contenido</strong></summary>

- [Descripción y funcionalidades](#1-descripción)
- [Arquitectura y tecnologías](#3-arquitectura-y-tecnologías)
- [Instalación con Docker](#4-requisitos-previos-y-cómo-levantar-el-proyecto)
- [Variables de entorno](#5-variables-de-entorno)
- [Roles, reglas operativas e interruptores](#6-roles-y-permisos)
- [Estructura, pruebas y modo sin conexión](#9-estructura)
- [Arquitectura técnica ampliada](#arquitectura-técnica-ampliada)
- [Seguridad y privacidad](#seguridad-y-privacidad)
- [Verificación y pruebas](#verificación-y-pruebas)
- [Despliegue y operación](#despliegue-y-operación)
- [Pendientes de validación y continuidad](#pendientes-de-validación-y-continuidad)
- [Anexo A: matriz de trazabilidad (111 RF)](#anexo-a-matriz-de-trazabilidad-111-rf)

</details>

## 1. Descripción
Hoy los jefes de agencia y oficiales de crédito reúnen varios archivos de Excel para saber cómo van socios, créditos y pagos en cada barrio. La plataforma centraliza la carga de esa información (CSV), valida su calidad y ubicación, la representa en mapas interactivos y de calor, calcula indicadores por zona y período, clasifica las zonas según criterios aprobados y apoya la planificación de visitas, con control de acceso por rol y ámbito y un historial inmutable de cambios.

## 2. Funcionalidades y estado real

| Paquete | Qué incluye |
|---|---|
| PF-01 Acceso y usuarios | Login genérico, bloqueo tras 5 intentos, registro de intentos, cierre real y por inactividad verificado en servidor, gestión de usuarios/roles/ámbito, matriz de permisos editable. |
| PF-02 Carga, calidad y trazabilidad | Carga CSV por pasos (previsualización → mapeo de columnas por alias → confirmación transaccional), esquemas de carga editables y versionados, bandeja de depuración (corregir/descartar/conservar), límites geográficos GeoJSON con vista previa, historial inmutable encadenado por hash con verificación. |
| PF-03 Visualización | Mapa MapLibre (coropleta, calor, socios y posibles socios por `bbox`), leyenda alineada, detalle de zona, tabla de indicadores ordenable y filtrable, comparación temporal con tendencias. |
| PF-04 Clasificación | Editor de versiones de criterios con validación de contradicciones, aprobación con una sola versión vigente, recálculo y explicación por zona. |
| PF-05 Visitas | Asignación de zonas, lista priorizada del oficial, posibles socios con validación espacial e idempotencia, rutas en mapa y listado; **visitas y seguimiento condicionados** (apagados por defecto). |
| PF-06 Reportes | CSV y PDF reales por tipo, nivel y período, con metadatos, solo el ámbito del usuario y bloqueo de reportes vacíos. |
| PF-07 Predictivo | Puntaje ponderado transparente de potencial de captación, pesos versionados, etiqueta «Estimación no confirmada»; **condicionado** (apagado por defecto). |

**Bloqueado:** RF-005.05 (conexión directa a la base de datos de la cooperativa): no existe sistema fuente ni credenciales; la opción es visible y está bloqueada.
**Fase 8 (opcional) completada y apagada por defecto:** modo campo sin conexión, activable con `habilitar_modo_offline` (ver sección «Modo campo sin conexión»).

## 3. Arquitectura y tecnologías
Consulta la sección **Arquitectura técnica ampliada** de este README.
- **Backend:** Python 3.12, Django 5.2 LTS, DRF, GeoDjango, PostgreSQL 16 + PostGIS 3.5, `djangorestframework-simplejwt`, `drf-spectacular`, pandas (lectura por bloques), ReportLab. Módulos por dominio con capas controlador (DRF) → servicio → repositorio; raíz de composición en `backend/config/container.py`.
- **Frontend:** React 19 (JavaScript/JSX), Vite 8, Tailwind CSS 4, React Router 8, MapLibre GL JS 6, Recharts 3, `motion`, React Hook Form + Zod, lucide-react, Inter autoalojada.
- **Decisiones:** JWT (access en memoria + refresh rotado en cookie HttpOnly) con sesión de servidor; importación síncrona con límites; ReportLab para PDF; PostGIS para asignación espacial por lote; mapa base externo y configurable.
- **Límites honestos:** cambiar de PostgreSQL/PostGIS a otro motor exigiría reescribir los repositorios (se minimizó el impacto, no se elimina); el despliegue productivo está preparado pero no probado; las fórmulas, umbrales y límites geográficos son de demostración.

## 4. Requisitos previos y cómo levantar el proyecto
- **Docker Desktop** (probado con Docker 29.9 y Compose v5.7 en Windows 11). Es el camino soportado.
- Node.js **solo** si se quiere ejecutar el frontend fuera de Docker (no necesario). La ejecución local del backend sin Docker en Windows requiere GDAL y **no se verificó**.

Comandos para **Windows CMD** (desde la raíz del repositorio):
```cmd
copy .env.example .env
```
Edite `.env` y reemplace las claves y la contraseña de la base de datos por valores aleatorios propios. Luego:
```bash
docker compose up -d --build
```
```bash
docker compose exec backend python manage.py seed_coac
```
En el perfil de desarrollo, el backend aplica las migraciones al iniciar.

| Servicio | URL |
|---|---|
| Aplicación | http://localhost:5173 |
| API | http://localhost:8000/api/v1/ |
| Documentación OpenAPI (Swagger) | http://localhost:8000/api/v1/docs/ |
| Salud | http://localhost:8000/api/v1/health/ |

La base de datos no publica puertos (solo es accesible desde la red de Compose). El acceso desde un teléfono en la misma red no se verificó.

## 5. Variables de entorno
| Variable | Descripción |
|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.development` en local. |
| `DJANGO_SECRET_KEY` | Clave de firma (sesiones y JWT). Obligatoria, larga y aleatoria. |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos, separados por coma. |
| `DJANGO_TRUSTED_ORIGINS` | Orígenes permitidos para CORS y para el refresh del token. |
| `CEDULA_HMAC_KEY` | Clave HMAC de la huella de cédula. Debe ser estable en el tiempo. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | Conexión a PostgreSQL/PostGIS. |
| `SEED_DEMO_PASSWORD` | Contraseña de las cuentas demo del seed (opcional). |
| `VITE_MAP_STYLE_URL` | Estilo del mapa base MapLibre (por defecto OpenFreeMap `positron`, sin clave). |

**Credenciales demo:** usuarios `admin`, `gerencia`, `jefe`, `jefesur`, `oficial`, `oficial2`, `oficial3`, `supervisor`, `metodologia` y `pvalarezo` (desactivada, para probar el rechazo). La contraseña es la de `SEED_DEMO_PASSWORD` en su `.env`; si la dejó vacía, el seed genera una aleatoria y la muestra **una sola vez** en la consola. Son cuentas locales de demostración.

## 6. Roles y permisos
Matriz **por defecto, a validar con la cooperativa** (editable en *Usuarios y roles*):

| Permiso | admin | gerencia | jefe_agencia | oficial | supervisor | metodologia |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| panel, mapa, indicadores, clasificación (ver) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| comparar.ver | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| criterios.definir / aprobar | – | – | – | – | – | ✓ |
| zonas.asignar | – | – | ✓ | – | – | – |
| zonas.propias, rutas.gestionar, visitas.registrar | – | – | – | ✓ | – | – |
| seguimiento.ver | – | ✓ | ✓ | – | ✓ | – |
| prospectos.registrar | – | – | ✓ | ✓ | – | – |
| reportes.generar | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| potencial.ver | ✓ | ✓ | ✓ | – | – | ✓ |
| datos.cargar/validar, limites, historial, usuarios, analisis.ejecutar, config | ✓ | – | – | – | – | – |

Ámbito: la agencia del usuario (vacía = toda la cooperativa); los oficiales ven solo sus zonas asignadas. Solo administrador, jefe de agencia y oficial ven puntos individuales.

## 7. Definiciones operativas (supuestos a validar)
Se muestran en la interfaz con la etiqueta «Definición operativa provisional».
- **Indicadores** por zona y período (mensual): socios con ubicación válida e ingreso hasta el fin del mes; créditos `vigente`/`vencido` desembolsados hasta el fin del mes y su monto; créditos con algún pago del período con `dias_atraso ≥ 1`; saldo vencido = suma de `valor_pendiente` de esos pagos; **morosidad** = saldo vencido / cartera × 100; **penetración** = socios / hogares estimados × 100. Denominador cero o sin hogares → «Sin datos». Los niveles superiores suman componentes y recalculan razones.
- **Clasificación:** reglas por categoría combinadas con AND; categorías evaluadas por prioridad (gana la primera que cumple); «Sin clasificar» si ninguna. Umbrales del seed: **DEMO**.
- **Potencial:** puntaje = Σ(peso × variable normalizada mín-máx) / Σ(pesos); variables: penetración baja, hogares, crecimiento de socios, posibles socios, morosidad baja; bandas alto ≥ 0,66, medio ≥ 0,33. No es un modelo de aprendizaje automático. Pesos del seed: **DEMO**.
- **Esquemas de carga** (*Datos → Esquemas de carga*): cada tipo tiene campos núcleo (no se eliminan) y alias; el administrador puede agregar campos opcionales (texto, número, entero, fecha, booleano, sensible) sin tocar código. Se guardan en `atributos`, se muestran en detalle y **no participan en KPIs ni clasificación**. En la previsualización de una carga se pueden asignar columnas a mano y guardarlas como alias.
- **Ubicación válida:** coordenadas en rango, dentro de Ecuador, al menos 4 decimales y dentro de una zona vigente; si no, el registro queda observado y excluido de mapas e indicadores.

## 8. Interruptores institucionales (Parámetros)
| Parámetro | Por defecto | Efecto |
|---|---|---|
| `habilitar_registro_visitas` | apagado | Habilita CU-17/CU-18 (frontend y backend). |
| `habilitar_analisis_predictivo` | apagado | Habilita CU-20/CU-21. |
| `habilitar_conexion_bd` | apagado, bloqueado | RF-005.05 no implementado. |
| `habilitar_modo_offline` | apagado | Modo campo sin conexión (sección «Modo campo sin conexión»). Requisito adicional propuesto, pendiente de validación institucional. |
| `horas_ventana_offline` | 24 | Horas desde la última autenticación en línea en que se puede trabajar sin conexión (1 a 168). |
| `minutos_inactividad_sesion` | 15 | Cierre automático por inactividad. |
Se cambian como administrador en *Parámetros*; cada cambio queda en el historial.

## 9. Estructura
```text
backend/   config/ (settings por entorno, urls, container) · core/ · modules/<dominio>/ · seed/samples/ · tests/
frontend/  src/{api,app,components,context,features,hooks,pages,styles,utils,test} · e2e/
deploy/    nginx (producción)
docker-compose.yml · docker-compose.prod.yml
```

## 10. Pruebas
La metodología, los resultados históricos y los límites de las pruebas están en **Verificación y pruebas**.
```bash
docker compose exec backend pytest
```
```bash
docker compose exec frontend npm run lint
```
```bash
docker compose exec frontend npx vitest run
```
```bash
docker compose --profile e2e run --rm e2e
```

## 11. Seguridad y despliegue
Consulta las secciones **Seguridad y privacidad** y **Despliegue y operación** de este README.

## 12. Datos de demostración
Todo lo que carga `seed_coac` es **sintético**: 24 barrios de Loja y Catamayo con polígonos esquemáticos (`fuente_oficial = "DEMO (sintético)"`, insignia «Datos de demostración»), 6 meses (mayo–octubre 2026) de socios, créditos y pagos inventados, criterios v1/v2 y pesos DEMO. Para usar datos reales: cargue los límites oficiales en *Datos → Límites geográficos* (GeoJSON con fuente, SRID 4326) y los CSV de la cooperativa en *Datos → Carga de archivos*. Ejemplos con errores intencionales en `backend/seed/samples/` (ver su `LEEME.md`).

## 13. Pendientes y decisiones institucionales requeridas
- Conexión directa a la base de datos de la cooperativa (RF-005.05): requiere aprobación, sistema fuente y credenciales.
- Validar fórmulas de indicadores, umbrales de clasificación, pesos del potencial, matriz de permisos, resultados de visita y frecuencias de visita.
- Límites geográficos oficiales (GAD/INEC) con fuente y licencia.
- Política de retención de datos y de respaldos.
- Modo campo sin conexión (riesgo del Acta): implementado y probado, **apagado por defecto**; la cooperativa debe validarlo antes de encenderlo, decidir la política de un PIN local (hoy no existe) y si se ofrece un mapa base descargable.
- Procesamiento asíncrono para archivos mayores a 20 MB / 100 000 filas.
- Despliegue productivo real (perfil preparado, no probado).

## 14. Solución de problemas
- **Docker no responde:** abra Docker Desktop y espere a que el motor esté en ejecución (`docker version` debe mostrar *Server*).
- **Fin de línea en `docker-entrypoint.sh`:** `.gitattributes` fuerza LF; si un editor lo cambió a CRLF, el contenedor falla con `/bin/sh^M`. Vuelva a guardarlo con LF.
- **Cambios del frontend no se reflejan:** el proyecto usa sondeo de archivos (`VITE_USE_POLLING=1`) porque Windows no propaga eventos al contenedor; reinicie `frontend` si persiste.
- **`node_modules`:** viven en un volumen de Docker; los de Windows no se usan.
- **GDAL/GeoDjango:** se instala dentro de la imagen (Debian trixie, GDAL 3.10). Fuera de Docker en Windows requiere instalación manual (no verificada).
- **El mapa base no aparece:** sin acceso a OpenFreeMap se muestra un fondo neutro con las zonas; configure `VITE_MAP_STYLE_URL`.
- **429 en el login:** límite de 20 intentos por minuto por IP; espere un minuto.


## 15. Modo campo sin conexión
Fase 8 opcional. Se controla con `habilitar_modo_offline` (*Parámetros*, apagado por defecto) y `horas_ventana_offline` (24 h). Es un **requisito adicional propuesto** (el Acta solo lo menciona como riesgo), pendiente de validación.

**Qué es y qué no es.** Sigue siendo un sitio web que se abre por su URL; no es una aplicación de tienda ni hay que instalarla («Añadir a la pantalla de inicio» es opcional). Con el interruptor encendido, el navegador registra un *service worker* (generado con `vite-plugin-pwa` 2.0, compatible con Vite 8) que guarda **solo los archivos estáticos** de la aplicación; **nunca** respuestas de la API (no hay caché en tiempo de ejecución y `/api` está excluido; la API responde `Cache-Control: no-store`).
- **Sin una visita previa con conexión en ese navegador no hay nada guardado.** El modo incógnito o borrar los datos del navegador eliminan lo guardado.
- El primer inicio de sesión requiere conexión.

**Qué funciona sin conexión** (para usuarios con permisos de campo: oficial de crédito y, en parte, jefe de agencia):
- Consultar la última sincronización: *Mis zonas* con categoría, prioridad y explicación (CU-15), *Rutas* (CU-16), indicadores **agregados** de sus zonas y polígonos simplificados. Se guarda por usuario en IndexedDB y vence con la ventana. **No se guardan datos individuales de socios.**
- Registrar posibles socios (CU-13), crear rutas nuevas (CU-16) y, si `habilitar_registro_visitas` está encendido, registrar visitas o marcarlas como no realizadas (CU-17). Van a una **cola de salida** (FIFO) con estado por elemento (`pendiente`, `enviando`, `sincronizado`, `rechazado`), intentos y motivo.
- Editar rutas existentes **requiere conexión** (evita conflictos). Todo lo demás (cargas, usuarios, criterios, reportes, historial, análisis, comparaciones…) se muestra deshabilitado con «Requiere conexión».
- El mapa base no está disponible: se dibujan las zonas y los puntos sobre un fondo neutro con el aviso «Mapa base no disponible sin conexión». Un paquete de teselas descargable (p. ej. PMTiles autoalojado) **no se incluye**: mejora futura con costo de almacenamiento por evaluar.
- La validación de la ubicación sin conexión es aproximada (polígonos simplificados de sus zonas); el servidor la confirma al sincronizar.

**Sincronización.** Se dispara con el evento `online`, al abrir la aplicación o volver a primer plano, con el botón **«Sincronizar ahora»** (indicador de la barra superior → panel de pendientes) y con reintentos con retroceso exponencial (2 s, 4 s, 8 s… hasta 5 min) **mientras la aplicación esté abierta**. No se promete sincronización con la aplicación cerrada: la *Background Sync API* no se usa porque el token vive solo en memoria y el *service worker* no puede autenticarse. El servidor (`POST /api/v1/campo/sincronizar/`) vuelve a validar cada elemento como si fuera en línea (permisos, ámbito, ubicación dentro de una zona, zona aún asignada, interruptores) y responde **por elemento**: un rechazo no bloquea a los demás; los rechazados se muestran con su motivo y se pueden corregir (posibles socios), reintentar o descartar. Reintentar nunca duplica (`client_uuid`). Se auditan la hora del dispositivo y la del servidor y un evento `sincronizacion_offline` con sus contadores. Si el interruptor se apaga, la cola pendiente igual se envía antes de borrar los datos locales.

**Sesión y datos locales.**
- Ventana: sin conexión se puede trabajar hasta `horas_ventana_offline` desde la última autenticación en línea (inicio de sesión o renovación validada por el servidor). Vencida, la aplicación oculta (borra) los datos de consulta hasta reconectar e iniciar sesión; **la cola pendiente se conserva**.
- Inactividad sin conexión: no se puede verificar una contraseña sin servidor; la pantalla se bloquea tras `minutos_inactividad_sesion` y se desbloquea al reconectar e iniciar sesión. Un **PIN local** queda **pendiente de decisión institucional**.
- Al cerrar sesión se borra todo lo local, con aviso previo si hay registros sin sincronizar (se perderían). Si el usuario fue desactivado o perdió sus permisos de campo, el servidor rechaza la sincronización y la aplicación borra los datos locales.
- Se solicita almacenamiento persistente (`navigator.storage.persist()`) y la falta de espacio (`QuotaExceededError`) se informa con un mensaje claro.
- No se cifra IndexedDB: con la clave en el mismo navegador protegería poco. Las defensas reales son la minimización, el vencimiento, el borrado y el bloqueo del dispositivo (ver sección «Seguridad y privacidad»).

**Límites de plataforma.**
- **Safari/iOS** puede borrar los datos locales de sitios que no se usan durante varios días (salvo si se añadió a la pantalla de inicio) y no tiene *Background Sync*: **sincronice antes de dejar de usar la aplicación**.
- El GPS del teléfono funciona sin internet, pero el navegador solo lo ofrece en contextos seguros (HTTPS o `localhost`): una prueba por HTTP en la red local no podrá usar «Usar mi ubicación»; marque el punto en el mapa o escriba las coordenadas.
- El *service worker* solo existe en la compilación de producción (`npm run build`); en `npm run dev` no se registra. Las pruebas E2E del modo usan `vite preview` dentro del contenedor e2e.

---

## Arquitectura técnica ampliada

### Visión general

```text
Navegador (React 19 + Vite, MapLibre GL JS, Recharts, motion)
   │  HTTPS · /api/v1 · JSON {success, data, meta, error}
   ▼
Django 5.2 + DRF (controladores delgados)  ──►  Servicios (reglas de negocio, transacciones)
                                                   │ interfaces I…Repository / IAuditoria / IUnitOfWork
                                                   ▼
                                              Repositorios Postgres… (único lugar con ORM/PostGIS)
                                                   ▼
                                     PostgreSQL 16 + PostGIS 3.5 (GiST, triggers, JSONB)
```

- **Modelo** = modelos Django + repositorios; **Vista** = frontend React; **Controlador** = vistas DRF.
- En desarrollo, Vite sirve el frontend y hace de proxy de `/api` (mismo origen ⇒ la cookie del refresh funciona con `SameSite=Strict`). En producción no corre Node: el frontend se compila a estáticos que sirve Nginx (`deploy/nginx`), que también hace de proxy hacia Gunicorn.

### Estructura

```text
backend/
  config/settings/{base,development,testing,production}.py   configuración por entorno 
  config/container.py      raíz de composición: elige repositorios (DB_BACKEND) y los inyecta en los servicios
  core/                    sobre de respuestas, errores, paginación por cursor, seguridad (permisos, ámbito, privacidad, límites de tasa),
                           utilidades (geo, períodos, números, texto), ParametroSistema, comandos seed_coac y verify_audit_chain
  modules/<dominio>/       models.py · repositories/ · services/ · views.py · urls.py · serializers.py · tests/
    usuarios      PF-01  login JWT + sesión de servidor, usuarios, roles, permisos
    territorio    PF-03  agencias, zonas (jerarquía), ubicaciones, ámbito, asignación espacial por lote
    cartera       PF-02  esquemas de carga, cargas CSV/GeoJSON, staging, observados, socios/créditos/pagos, indicadores
    clasificacion PF-04  versiones de criterios, reglas, prioridad por zona
    campo         PF-05  asignaciones, posibles socios, rutas, visitas (condicionadas)
    analitica     PF-03/07 panel, mapa, indicadores agregados, comparación, potencial de captación (condicionado)
    reportes      PF-06  exportadores CSV/PDF
    auditoria     transversal: historial append-only encadenado
  seed/samples/            CSV y GeoJSON de ejemplo con errores intencionales
frontend/src/
  api/client.js            único cliente HTTP (token en memoria, refresh con rotación, caché por usuario)
  app/                     router (carga diferida por ruta), navegación por permisos, rutas protegidas
  components/{glass,layout,maps,charts,tables,feedback}/  sistema visual y componentes reutilizables
  context/                 sesión, filtros de la barra superior, avisos
  features/<dominio>/api.js  un módulo de API por funcionalidad
  hooks/                   useApi, useCursorList, useDebounce, useMediaQuery, useSpecularHover
  pages/                   una pantalla por ruta
```

### Dependencias entre módulos (verificadas por `backend/tests/test_arquitectura.py`)

`usuarios`, `territorio` y `auditoria` no importan otros módulos · `cartera → territorio` · `clasificacion → cartera, territorio` · `campo → territorio, clasificacion, cartera (lectura de indicadores)` · `analitica → todos los anteriores` · `reportes → analitica y anteriores`. `core` no depende de ningún módulo: el ámbito por zonas asignadas lo registra `campo` al iniciar (`registrar_proveedor_zonas_asignadas`). Los efectos entre módulos que irían «hacia atrás» (recalcular la clasificación tras una carga, actualizar la zona de los prospectos tras cambiar límites) se inyectan como observadores desde `config/container.py`.

`campo` lee indicadores de `cartera` (lista priorizada del oficial y comparación antes/después). Es una dependencia de lectura hacia un módulo inferior, sin ciclos.

### Principios aplicados (y lo que se simplificó a propósito)

| Principio | Dónde |
|---|---|
| Responsabilidad única | La carga se divide en `lector.py` (lectura por bloques), `mapeo.py` (alias), `validacion.py` (reglas por fila), `AlmacenPrivado` (archivo), `ServicioCargas` (orquesta), `ServicioIndicadores` (recalcula), auditoría. Las vistas DRF solo validan entrada, comprueban permisos y delegan. |
| Abierto/cerrado | Operadores de reglas (`OPERADORES`/`INTERVALOS` en `reglas.py`), validadores por tipo de carga (`VALIDADORES`), exportadores de reporte (`EXPORTADORES`): se agregan registrando, sin editar el núcleo. |
| Sustitución de Liskov | Todos los repositorios implementan su contrato `I…Repository`; `FakeUnitOfWork` y `FakeAuditoria` sustituyen a los reales en pruebas de servicios puros. |
| Segregación de interfaces | Contratos pequeños por módulo (no hay «repositorio dios»); en el frontend, un módulo de API por funcionalidad. |
| Inversión de dependencias | Los servicios reciben repositorios, auditoría y unidad de trabajo por constructor desde `config/container.py`. Prueba automática: ningún archivo `services/*.py` importa `django.db`, `rest_framework`, `django.http` ni modelos. |
| Funciones puras | Indicadores (`calcular_razones`, `agregar`, `tendencia`), reglas de clasificación (`validar_version`, `evaluar`), puntaje de potencial (`normalizar`, `puntajes`), leyenda (`rangos_leyenda`), cadena de hash (`calcular_hash`, `verificar`). |
| KISS/YAGNI | Sin Celery/Redis (importación síncrona con límites), sin caché distribuida (caché local de geometrías simplificadas), sin abstracción genérica de consultas, sin teselas vectoriales dinámicas (`ST_AsMVT` queda como mejora futura). |

### Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Django **5.2 LTS**  | El stack fijado exige Django 5.x; 5.2 es LTS con soporte hasta 2028 y todas las dependencias lo soportan. |
| Imagen base **Debian trixie** (GDAL 3.10) | Con bookworm (GDAL 3.6) Django advierte que GDAL < 3.9 no bloquea accesos de red/archivo en referencias espaciales maliciosas. |
| **JWT** con access de 15 min en memoria + refresh rotado en cookie `HttpOnly; SameSite=Strict; Path=/api/v1/auth/` + **sesión de servidor** (`SesionUsuario`) | Permite cierre real e inactividad verificada en servidor (RF-001.03/.04) aunque el JWT sea autocontenido. |
| **Importación síncrona** por pasos con *staging* | Previsualizar antes de confirmar (RF-003.01) y confirmar en una transacción con *rollback* completo; 20 MB / 100 000 filas configurables. Un volumen mayor requeriría procesamiento asíncrono. |
| Asignación espacial **por lote** | Una consulta `unnest` + `LATERAL` con `ST_Covers` e índice GiST por bloque, no fila por fila. |
| Indicadores **precalculados por zona hoja** y agregados al vuelo | Los niveles superiores suman componentes de las hojas del ámbito y recalculan razones (nunca se promedian). |
| Polígonos simplificados en caché | `ST_SimplifyPreserveTopology` por tolerancia, cacheado por versión de geometrías. |
| **MapLibre GL JS imperativo** (componente `GeoMap`) en vez de un *wrapper* | Control directo de `setData` sin recrear el mapa ni las capas; una dependencia menos. Worker empaquetado con `?worker&url`. |
| Mapa base **OpenFreeMap** (`VITE_MAP_STYLE_URL`) | Sin clave; configurable (MapTiler con clave restringida o PMTiles autoalojado). Si no carga, se usa un fondo neutro y se avisa. |
| ReportLab | PDF sin dependencias del sistema. |
| Cédula como **HMAC-SHA256 + máscara** | Detecta duplicados sin guardar la cédula completa (ver sección «Seguridad y privacidad»). |

### Desacoplamiento realista de la base de datos (no se promete migrar sin cambios)

Los repositorios y DTO reducen el acoplamiento, **no lo eliminan**. Dependen de PostgreSQL/PostGIS:
- `territorio`: `ST_Covers`, `ST_SimplifyPreserveTopology`, `ST_Equals`, `ST_GeomFromGeoJSON`, GiST, `unnest`/`LATERAL`.
- `cartera`: agregaciones de indicadores en SQL con CTE, `bulk_create` con retorno de claves, `UPDATE … FROM`.
- `auditoria`: `pg_advisory_xact_lock` y el *trigger* PL/pgSQL que impide `UPDATE/DELETE/TRUNCATE`.
- Restricciones parciales (`UniqueConstraint(condition=…)`), JSONB, `select_for_update`.

Migrar a MongoDB u otro motor exigiría reescribir esas implementaciones de repositorio (los servicios y la API no cambiarían). Se eligió minimizar el impacto, no prometer neutralidad.

### Frontend

- **Sistema visual**: tokens en `src/styles/index.css` (identidad COAC del prototipo), materiales de cristal en `src/styles/glass.css` (capa `components`), radios `--radius-panel/card/control/pill`, Inter autoalojada (`@fontsource-variable/inter`).
- **Barra superior contextual**: cada pantalla declara con `useBarraSuperior()` sus filtros (geografía encadenada, período, variable) y su acción primaria; no se repiten en la página.
- **Movimiento**: springs críticamente amortiguados (`utils/motion.js`), coreografía de ensamblado (`Ensamblado`/`Pieza`/`Grupo`), salida rápida de página, `prefers-reduced-motion` respetado; Recharts anima sus series y motion los contenedores (sin duplicar).
- **Datos**: `useApi` y `useCursorList` cancelan solicitudes obsoletas con `AbortController`; caché por endpoint+filtros con TTL y límite, borrada al cerrar sesión.
- **Modo campo sin conexión (Fase 8, apagado por defecto)**: `src/offline/` separa la lógica pura (`cola.js`: cola FIFO con estados y retroceso exponencial; `respaldo.js`: respuestas locales con la forma de la API) del almacenamiento (`almacen.js`: IndexedDB por usuario) y de React (`OfflineContext.jsx`: disparadores de sincronización, paquete y *service worker*). `features/campo/api.js` envuelve las consultas de campo con `conRespaldo` y los registros con `enviarOEncolar`, así las pantallas no tienen ramas especiales. En el backend, `ServicioSincronizacion` reutiliza los métodos de `ServicioCampo` (misma validación que en línea) con un punto de guardado por elemento.


---

## Seguridad y privacidad

La plataforma maneja datos financieros y personales de socios. Principios: mínimo privilegio, defensa en profundidad y autorización siempre en el servidor.

### Autenticación (RF-001)
- Login con respuesta **genérica** ante usuario inexistente, contraseña incorrecta, cuenta desactivada o bloqueo: «No fue posible iniciar sesión…». Para usuarios inexistentes se calcula igualmente un hash (tiempo de respuesta similar).
- **Bloqueo temporal**: 5 intentos fallidos por usuario+IP en 15 minutos; los intentos siguientes reciben la misma respuesta genérica. Además, límite de tasa de 20 solicitudes/minuto por IP en el login.
- Cada intento (exitoso o fallido) se registra en `IntentoAcceso` y en el historial (categoría `acceso`) **sin contraseñas**. Los rechazos se confirman antes de responder.
- **Tokens**: access JWT de 15 min **solo en memoria** del navegador; refresh rotado con lista de revocación en cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth/`, `Secure` fuera de desarrollo. El endpoint de refresh exige la cabecera `X-COAC-Refresh: 1` y un `Origin` permitido.
- **Sesión de servidor** (`SesionUsuario`): cada solicitud verifica revocación e inactividad (`ParametroSistema.minutos_inactividad_sesion`, 15 por defecto). Excedida, la sesión se cierra y se responde 401 `SESION_INACTIVA`; el refresh también se rechaza. El cliente tiene un temporizador de cortesía.
- **Cierre de sesión real**: revoca el refresh y la sesión; el access deja de ser aceptado aunque no haya expirado.
- Cambiar rol, ámbito o estado de un usuario revoca sus sesiones: los permisos nuevos rigen desde el siguiente acceso (RF-002.03).
- Contraseñas con los hashers de Django y validadores (mínimo 10 caracteres, no comunes, no numéricas, no similares al usuario).
- No hay usuarios, contraseñas ni claves en el código. Las contraseñas demo provienen de `SEED_DEMO_PASSWORD` o se generan aleatoriamente y se muestran una vez.

### Autorización
- Matriz roles × 22 permisos **por defecto** (sección 7.2 del encargo), editable por el administrador y **pendiente de validación con la cooperativa**.
- **Ámbito**: `Usuario.agencia` (NULL = toda la cooperativa); los oficiales (`zonas.propias`) quedan limitados a sus zonas asignadas. El filtrado se hace **en la consulta del servidor** (zonas hoja del ámbito), no después.
- **Marcadores individuales** (socios/prospectos puntuales): solo `admin`, `jefe_agencia` y `oficial`, dentro de su ámbito; los demás roles ven agregados. Los puntos de socios solo llevan identificador y zona (sin nombre ni cédula), con `bbox` validado y límite máximo.
- Identificadores directos protegidos contra **IDOR** (zonas, rutas, asignaciones, comparaciones): fuera del ámbito se responde 404. Pruebas de acceso horizontal y vertical en `modules/*/tests`.
- Ocultar opciones en la interfaz es solo ergonomía; cada endpoint declara sus permisos.

### Privacidad de datos personales
- **Cédula**: no se persiste completa en ninguna tabla. Se guarda `cedula_hash` (HMAC-SHA256 con `CEDULA_HMAC_KEY`, para detectar duplicados y buscar) y `cedula_mascara` (`******1234`, para mostrar). Las filas observadas (`fila_raw`) y la previsualización se guardan/muestran enmascaradas; antes del mapeo de columnas se enmascara cualquier valor con forma de cédula.
- Campos adicionales marcados `sensible` se guardan como `***`.
- El **historial** no contiene contraseñas, tokens ni datos personales completos: en las actualizaciones por reimportación, los campos personales (nombre, cédula, ubicación, dirección, ingreso) se registran como «[dato personal modificado]» y los demás con valor anterior y nuevo. *Compromiso aceptado*: para esos campos personales no se conserva el valor anterior en el historial (RF-006.04 queda cubierto con valores para los campos no personales); se documenta como decisión a validar con la cooperativa.
- Reportes: agregados por zona, sin datos personales.
- **Retención**: pendiente de política institucional (no se inventan plazos legales). Los archivos subidos se eliminan del almacenamiento privado al confirmar o cancelar la carga.
- **Mapa base de terceros**: el proveedor de teselas (OpenFreeMap por defecto) ve el área geográfica consultada por cada usuario, **nunca** los datos de socios (los polígonos y puntos vienen de la API propia). Alternativa: autoalojar teselas (PMTiles) con `VITE_MAP_STYLE_URL`.

### Protección de API y archivos
- CORS con orígenes explícitos (`DJANGO_TRUSTED_ORIGINS`), `ALLOWED_HOSTS` explícito, `DEBUG=False` fuera de desarrollo, HSTS/SSL redirect/cookies seguras en producción.
- Cabeceras: `Cache-Control: no-store` y CSP restrictiva en `/api/`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Límites de tasa: login 20/min/IP, cargas 10/hora/usuario, reportes 60/hora/usuario.
- Cargas: extensión, tamaño (20 MB), filas (100 000), **contenido real** (sin bytes binarios, UTF-8, encabezados válidos), nombre de archivo saneado, almacenamiento **fuera de directorios públicos** con nombre aleatorio y comprobación anti *path traversal*. GeoJSON: geometrías validadas con GEOS (tipo, validez, recuadro de Ecuador).
- Consultas parametrizadas en todo SQL manual; filtros y ordenamientos por lista blanca; errores internos sin detalles en la respuesta (sí en logs con ID de correlación).
- GDAL 3.10 (imagen trixie) para evitar accesos de red/archivo desde referencias espaciales maliciosas.

### Auditoría inmutable (RF-006.05)
- `historial_cambios` es *append-only*: la aplicación nunca actualiza ni borra, y un *trigger* PL/pgSQL bloquea `UPDATE`, `DELETE` y `TRUNCATE`.
- Cada evento guarda `secuencia`, `prev_hash` y `hash` SHA-256 sobre una serialización canónica (claves ordenadas, UTF-8, fechas UTC ISO 8601, decimales como texto). La secuencia se asigna bajo `pg_advisory_xact_lock` (seguro en concurrencia).
- Verificación: `python manage.py verify_audit_chain` o `GET /api/v1/historial/verificar/`.
- Excepción de pruebas: solo la configuración `testing` activa la variable de sesión `coac.permitir_purga_pruebas` para que el *flush* de las pruebas transaccionales pueda vaciar la tabla con `TRUNCATE`; `UPDATE` y `DELETE` siguen bloqueados siempre. En producción se recomienda además que el usuario de la aplicación **no** sea dueño de la tabla y no tenga `UPDATE/DELETE/TRUNCATE` sobre ella (un superusuario de la base siempre podría desactivar el *trigger*).

### Secretos
- `.env` local (ignorado por Git) y variables de entorno en producción; `.env.example` con valores ficticios.

### Modo campo sin conexión (datos locales)
Apagado por defecto (`habilitar_modo_offline`). Cuando se enciende:
- **Minimización:** el dispositivo guarda solo el paquete del propio usuario (`GET /api/v1/campo/paquete-offline/`): sus zonas asignadas con categoría, prioridad y explicación, indicadores **agregados** por zona, polígonos simplificados y sus rutas; además, su cola de registros (posibles socios, rutas y visitas que él mismo creó). **Sin cédulas ni datos individuales de socios** (hay una prueba que lo verifica). El perfil guardado es el del propio usuario (nombre, rol, permisos, agencia).
- **Service worker:** solo archivos estáticos de la compilación; `/api` excluido; sin caché en tiempo de ejecución. Las respuestas de la API llevan `Cache-Control: no-store`.
- **Vencimiento:** el paquete y la sesión sin conexión valen `horas_ventana_offline` (24 h) desde la última autenticación validada por el servidor. Vencida la ventana, el paquete se borra y la aplicación exige reconectar e iniciar sesión; solo la cola se conserva para no perder trabajo.
- **Bloqueo:** sin conexión no se puede verificar una contraseña; tras la inactividad configurada la pantalla se bloquea (se ocultan los datos) y se desbloquea al reconectar e iniciar sesión. Al reconectar, la sesión solo se recupera sin contraseña si el servidor acepta el refresh (que también aplica la inactividad y vence a las 12 h). **PIN local: pendiente de decisión institucional.**
- **Borrado:** cerrar sesión borra todo lo local (avisando antes si hay pendientes). Si al sincronizar o renovar la sesión el servidor responde que la cuenta está desactivada (`USUARIO_DESACTIVADO`, solo a quien presenta un token o refresh válido de esa cuenta) o que ya no tiene permisos de campo (403), la aplicación borra los datos locales. Al iniciar sesión otro usuario en el mismo navegador se borra el paquete del anterior.
- **Revalidación total en el servidor:** `POST /api/v1/campo/sincronizar/` aplica los mismos permisos, ámbito, ubicación, zona asignada e interruptores que los endpoints en línea, elemento por elemento, con idempotencia por `client_uuid` (un `client_uuid` de otro usuario se rechaza con `CONFLICTO_IDEMPOTENCIA`) y límite de 50 elementos por lote y de solicitudes por usuario.
- **Honestidad sobre el cifrado local:** IndexedDB **no** se cifra. Cifrarlo con una clave guardada en el mismo navegador protegería poco frente a quien tenga el dispositivo desbloqueado. Las defensas reales son la minimización, el vencimiento, el borrado y el **bloqueo del propio dispositivo** (PIN/biometría del teléfono). No se afirma que los datos locales estén «protegidos» más allá de eso.
- **Safari/iOS** puede borrar los datos locales tras varios días sin uso: se recomienda sincronizar antes de dejar de usar la aplicación.

### Limitaciones conocidas
- La conexión directa a la base de datos de la cooperativa (RF-005.05) no existe: el interruptor está apagado y bloqueado.
- Modo campo sin conexión: ver la sección «Modo campo sin conexión (datos locales)». Apagado por defecto; un PIN local está pendiente de decisión institucional.
- `npm audit` (dependencias de desarrollo): 4 avisos moderados en `glob`/`minimatch` que llegan por `workbox-build` → `vite-plugin-pwa`. Se usan solo al **compilar** (generan el *service worker*); no forman parte del paquete que recibe el navegador. La «corrección» automática bajaría a `vite-plugin-pwa` 1.1, que no declara compatibilidad con Vite 8. `npm audit --omit=dev` sigue en 0.
- Producción preparada pero no probada en un servidor real (ver sección «Despliegue y operación»).


---

## Verificación y pruebas

Fecha de la última ejecución: 19-nov-2026 (incluye la Fase 8), en Windows 11 con Docker Desktop (Docker 29.9, Compose v5.7). Todos los comandos se ejecutan desde la raíz del repositorio con los servicios levantados (`docker compose up -d`).

### Resumen

| Suite | Comando | Resultado real |
|---|---|---|
| Backend (pytest + pytest-django, PostgreSQL/PostGIS real) | `docker compose exec backend pytest` | **117 pruebas, 117 en verde** (14 del modo sin conexión) |
| Lint backend (ruff: E, F, W, B, I) | `docker compose exec backend ruff check .` | Sin errores |
| Esquema OpenAPI | `docker compose exec backend python manage.py spectacular --validate --file /tmp/schema.yml` | 0 errores (85 avisos de tipado: vistas que responden `dict`) |
| Dependencias Python | `docker compose exec backend pip-audit -r requirements/base.txt` | Sin vulnerabilidades conocidas |
| Frontend unitarias (Vitest + Testing Library, jsdom) | `docker compose exec frontend npx vitest run` | **34 pruebas, 34 en verde** (15 de la cola sin conexión) |
| Lint frontend (ESLint 10 + react-hooks 7) | `docker compose exec frontend npm run lint` | 0 errores, 0 avisos |
| Build de producción | `docker compose exec frontend npm run build` | Compila sin errores (aviso de tamaño del *chunk* de MapLibre, que solo carga en rutas con mapa); `vite-plugin-pwa` 2.0 genera `sw.js` con 92 archivos estáticos precargados (≈3,5 MB) y ninguna ruta de `/api` |
| Dependencias npm de ejecución | `docker compose exec frontend npm audit --omit=dev` | 0 vulnerabilidades (`npm audit` completo: 4 moderadas de compilación vía `workbox-build`; ver sección «Seguridad y privacidad») |
| E2E (Playwright 1.65, Chromium headless en contenedor) | `docker compose --profile e2e run --rm e2e` | Ver sección E2E |
| Seed idempotente | `docker compose exec backend python manage.py seed_coac` (dos veces) | Mismos conteos tras la segunda ejecución; «Nuevos: nada» |
| Integridad del historial | `docker compose exec backend python manage.py verify_audit_chain` | «Cadena íntegra» |

### Backend (117)
Ubicación: `backend/tests/` y `backend/modules/*/tests/`. Base de pruebas PostGIS creada por Django; configuración `config.settings.testing` (forzada con `--ds` porque el contenedor define `DJANGO_SETTINGS_MODULE=development`).

- **Arquitectura** (`tests/test_arquitectura.py`): ningún servicio importa `django.db`, `rest_framework`, `django.http` ni modelos; dependencias entre módulos según la sección 4.2; `core` no depende de módulos.
- **Utilidades**: conversión `latitud/longitud ↔ [lng, lat]`, validación de coordenadas y `bbox`, períodos, redondeo mitad hacia arriba, cédula (HMAC y máscara), nombres de archivo seguros, cursor.
- **PF-01**: login exitoso con cookie `HttpOnly/SameSite=Strict`, respuesta genérica (contraseña errónea, usuario inexistente, cuenta desactivada, datos vacíos), registro de intentos sin contraseña, bloqueo tras 5 fallos, inactividad en servidor (`SESION_INACTIVA`), refresh con cabecera, rotación y revocación del anterior, `Origin` no permitido, logout que invalida access y refresh, token manipulado; CRUD de usuarios, validación por campo, agencia obligatoria por rol, cambio de rol que revoca sesiones, desactivación que conserva historial, matriz de permisos; acceso vertical (roles sin permiso → 403).
- **Auditoría**: encadenamiento, *trigger* que bloquea `UPDATE/DELETE/TRUNCATE`, detección de alteración, borrado y reordenamiento, API de solo lectura, **concurrencia** (12 hilos, secuencia sin huecos y cadena íntegra).
- **PF-02**: flujo completo de carga (previsualización con cédulas enmascaradas → confirmación → indicadores recalculados → auditoría → CSV de errores), columnas faltantes y mapeo manual guardado como alias (nueva versión de esquema), archivo repetido rechazado salvo reemplazo, reimportación sin duplicados con detección de cambios, **rollback completo** ante fallo simulado, contenido no CSV/binario/no UTF-8, extensión, tipo y período, límite de filas, permisos, campos adicionales en `atributos` (sensibles enmascarados), créditos con socio inexistente observados y luego corregidos, corrección revalidada, descartar/conservar con justificación, esquemas (núcleo no eliminable, núcleo opcional que sigue opcional, plantilla), límites GeoJSON inválidos rechazados conservando zonas y válidos con vista previa y confirmación, conexión a BD bloqueada; los **archivos de `seed/samples`** se clasifican como documenta su `LEEME.md`.
- **Indicadores**: agregación que recalcula razones (no promedia), denominadores nulos → «Sin datos», tendencias, mapeo por alias, validación de pagos, valores precalculados por zona.
- **PF-03**: ámbito por agencia y por zonas asignadas, **IDOR** horizontal (404), agregación superior solo con el ámbito, mapa (polígonos, calor, leyenda), «Sin datos» ≠ 0, puntos individuales solo para roles autorizados y con `bbox` acotado, indicadores ordenables/paginados con última carga y orden por lista blanca, panel con variaciones, comparación con tendencias y faltantes.
- **PF-04**: validación de inconsistencias (sin reglas, contradicciones, `entre`, prioridades y colores), solapamiento como advertencia, evaluación por prioridad y «sin datos», versión pendiente → aprobada como única vigente con recálculo, explicación por zona, versión inconsistente no guardada, mensaje sin versión aprobada.
- **PF-05**: asignación dentro/fuera de ámbito, retiro, IDOR entre agencias, mis zonas, prospectos idempotentes (`client_uuid` e `Idempotency-Key`), ubicación imprecisa/fuera de zona/fuera de ámbito, roles sin permiso, rutas solo con zonas asignadas y geometría, visitas bloqueadas con el interruptor apagado y, con él encendido, validación, asociación con la ruta, seguimiento (100 %) y advertencia de no causalidad.
- **Modo campo sin conexión** (`modules/campo/tests/test_sincronizacion.py`, 14): el interruptor ya se puede activar y publica `horas_ventana_offline`; paquete bloqueado con el interruptor apagado; paquete solo con las zonas propias, polígonos de esas zonas y sin datos individuales de socios (`Cache-Control: no-store`); roles sin trabajo de campo sin paquete; **idempotencia** (mismo `client_uuid` → mismo id, `duplicado: true`, también por el endpoint en línea); **lote con éxitos y rechazos parciales** en orden (fuera de zona, fuera de ámbito, zona no asignada, elemento mal formado, visitas apagadas) con contadores; auditoría de la hora del dispositivo y evento `sincronizacion_offline`; **zona reasignada** mientras estaba sin conexión (ruta y visita rechazadas, lo demás aceptado); `client_uuid` de otro usuario (`CONFLICTO_IDEMPOTENCIA`); **usuario desactivado** (401 `USUARIO_DESACTIVADO`, nada creado) también al renovar; permiso perdido (403 del lote, rechazo por elemento); **token vencido o ausente**; lote vacío o de más de 50.
- **PF-06/07**: CSV con metadatos y solo el ámbito, PDF real (`%PDF`), reporte vacío bloqueado, permisos, clasificación sin criterios (409); potencial apagado por defecto con motivo, y encendido: sin configuración, datos insuficientes, pesos versionados, ejecución con etiqueta «Estimación no confirmada», resultados filtrados por ámbito y auditados.

### Frontend unitarias (34)
`frontend/src/test/`: cliente HTTP (sobre, token solo en cabecera, `ApiError` con campos, refresh único y reintento, evento de inactividad, caché por endpoint y filtros que se borra al cerrar sesión, parámetros), formato («Sin datos» ≠ 0, conversión `latitud/longitud`), **brillo especular** (sigue al dedo en táctil y se apaga al soltar; con `prefers-reduced-motion` queda centrado y no sigue al puntero), tabla (carga, vacío, error con reintento, «Ver más (mostrando X de Y)»), KPI sin datos, leyenda alineada con la expresión `step` del mapa, rutas protegidas (sin permiso y función condicionada), barra lateral expandida/colapsada accesible, `useApi` (cancela la solicitud obsoleta y permite reintentar), `GeoMap` sin WebGL muestra la alternativa (MapLibre simulado: jsdom no tiene WebGL).

`frontend/src/test/offline.test.js` (15, modo sin conexión; IndexedDB con `fake-indexeddb`): cola FIFO con estados, hora del cliente y sin duplicar el mismo `client_uuid`; envío en orden con rechazo parcial que no bloquea; sin conexión vuelve a pendiente con **retroceso exponencial** (2 s, 4 s… tope 5 min, variación ±20 %) y «Sincronizar ahora» lo ignora; 401 conserva sin contar el intento y cuenta desactivada / sin permisos pide borrar; error temporal por elemento; un solo envío a la vez; recuperación de «enviando» y lotes; corregir/descartar rechazados; retención de sincronizados; notificaciones; almacén por usuario con borrado total; punto dentro de polígono con huecos; orden sugerido local y rutas de la cola.

### E2E (Playwright)
Proyectos: escritorio 1366×768, tablet 768×1024 táctil, móvil 390×844 (Pixel 7) y **sin-conexion** (1366×768). Archivos: `frontend/e2e/acceso-mapa.spec.js`, `frontend/e2e/responsive.spec.js` y `frontend/e2e/sin-conexion.spec.js`. Se ejecutan contra el entorno de desarrollo (datos del seed) dentro de la red de Docker; el proyecto **sin-conexion** usa la compilación real servida por `vite preview` en el propio contenedor e2e (`webServer` de `playwright.config.js`), porque el *service worker* no existe en `npm run dev`.

- Acceso: mensaje genérico (usuario inexistente y cuenta desactivada); oficial con menú por rol, «Acceso restringido» en `/usuarios`, «Función no habilitada» en `/visitas` y cierre de sesión que impide volver al panel.
- Panel con KPI reales y última carga; **mapa dibujado por MapLibre** (se comprueba con `queryRenderedFeatures` que se renderizan los 24 barrios) y tabla alternativa con los mismos datos; navegación rápida entre pantallas sin pantallas en blanco ni encabezados duplicados, con «atrás».
- **Modo campo sin conexión** (enciende `habilitar_modo_offline` por API como administrador y lo apaga al terminar): (1) tras una visita con conexión, con `context.setOffline(true)` la URL abre desde el *service worker*, *Mis zonas* muestra la lista del paquete y el aviso «Mapa base no disponible sin conexión», el Panel muestra «Requiere conexión», se registra un posible socio (queda en la cola, 0 en el servidor) y al reconectar se sincroniza **una sola vez** (1 en el servidor, también tras recargar); (2) cerrar sesión con pendientes muestra el aviso y borra las bases locales y la meta (nada llega al servidor); (3) con la ventana vencida (última autenticación simulada hace 25 h) la aplicación abre en el login con el motivo, borra los datos de consulta y conserva la cola, que se envía al iniciar sesión.
- Responsive en los tres tamaños para `/panel`, `/mapa`, `/indicadores`, `/clasificacion`, `/datos/cargas`, `/historial`, `/usuarios`: sin desplazamiento horizontal de página y, en tablet y móvil, sin controles táctiles menores de 44 px; navegación inferior y hoja de filtros en móvil.

Resultados reales registrados:
1. Primera ejecución completa: fallos que revelaron **defectos reales**, corregidos: tooltips ocultos que ensanchaban la página (scroll horizontal en el Panel), texto accesible de la tabla que escapaba del contenedor (scroll horizontal en Usuarios a 768 px), botón de la leyenda del mapa de 36 px en táctil, y el contenedor del mapa con altura 0 por el CSS de MapLibre (detectado con capturas). También se corrigieron un localizador ambiguo y el criterio táctil de casillas (se mide su etiqueta).
2. Ejecución posterior: **29 de 29 en verde** (1,6 min).
3. Tras ajustes visuales del KPI, una ejecución falló en el login de `admin`: era el **bloqueo por 5 intentos fallidos** funcionando, porque cada corrida hacía un intento fallido con `admin`. La prueba ahora usa un usuario inexistente. La ejecución final se registra en la siguiente línea.

**Ejecución final: 29 de 29 en verde (1,6 min)** — `docker compose --profile e2e run --rm e2e`.
4. Fase 8: la primera ejecución del proyecto sin-conexion falló en la prueba de ventana vencida porque, al reconectar, la cookie del refresh seguía válida en el servidor (el vencimiento se simuló solo en el dispositivo) y la sesión se restauró sola. Es el comportamiento esperado (el servidor aplica su propia inactividad y el refresh vence a las 12 h, antes que la ventana de 24 h); la prueba ahora borra la cookie para reproducir el caso real.

**Ejecución con la Fase 8: 33 de 33 en verde (1,8 min)** — `docker compose --profile e2e run --rm e2e`.

Efecto secundario conocido: cada ejecución del proyecto sin-conexion deja dos posibles socios «E2E sin conexión …» / «E2E ventana …» del usuario `oficial` en la base de demostración (no hay API de borrado; se eliminan volviendo a crear la base con el seed).

### Fidelidad visual (documentación original, sección 10.5)
Capturas con Playwright del Panel a 1440×900 y 390×844 y del Mapa a 1440×900, comparadas con `docs/diseno-objetivo.png`: se reproducen la barra superior flotante (logo, estado de datos, filtros en píldoras con prefijo y chevron, acción «+ Exportar (PDF/CSV)», avisos y perfil a la derecha), el rail en cápsula con ícono activo en burbuja blanca y acceso aislado abajo, la fila de 4 KPI, la gráfica combinada con alternador Barrios/Parroquias y el panel lateral de lista. Diferencias aceptadas a propósito: paleta del prototipo (azul/dorado COAC) en lugar de la de la captura; datos reales en lugar de los ilustrativos; el panel lateral muestra **zonas prioritarias** (el registro de visitas en vivo y el GPS de oficiales no son requisitos); los KPI de la captura sin respaldo (meta, umbral SEPS, ticket promedio, efectividad de cobertura) se sustituyen por cartera, morosidad, créditos activos y penetración; el selector es de **mes**, no de rango. Por debajo de 1536 px el perfil se muestra compacto (avatar) para que los filtros quepan.

### No ejecutado
- Despliegue de producción (`docker-compose.prod.yml`): no se construyó ni levantó en un servidor real. No ejecutado: no hay servidor ni dominio disponibles.
- Respaldo y restauración: documentados en la sección «Despliegue y operación», no probados. No ejecutado: fuera del alcance del entorno local.
- `EXPLAIN ANALYZE` de los planes críticos: no se registraron planes con volúmenes representativos (el seed tiene ~2 000 socios). No ejecutado: sin datos de volumen real.
- Prueba de rendimiento con limitación de CPU 4× y pruebas manuales en teléfonos físicos y Safari/iOS. No ejecutado: solo se dispuso de Chromium headless.
- Acceso desde un teléfono en la misma red. No verificado.
- Modo campo sin conexión en dispositivos reales (Android/Chrome, iPhone/Safari), con la aplicación en segundo plano o añadida a la pantalla de inicio, y con geolocalización real. No ejecutado: solo se dispuso de Chromium headless (la desconexión se simula con `context.setOffline`).


---

## Despliegue y operación

> **Estado:** el perfil de producción está **preparado y documentado, pero no probado en un servidor real**. Lo verificado está marcado como tal.

### Entornos

| Entorno | Settings | Cómo se usa |
|---|---|---|
| Desarrollo | `config.settings.development` | `docker compose up --build` (verificado) |
| Pruebas | `config.settings.testing` | `docker compose exec backend pytest` (verificado) |
| Producción | `config.settings.production` | `docker-compose.prod.yml` (preparado, no probado) |

`production.py` se niega a arrancar si `DJANGO_ALLOWED_HOSTS` está vacío o contiene `*`, si falta `DJANGO_TRUSTED_ORIGINS` o si `DJANGO_SECRET_KEY` es corta o de ejemplo. `base.py` exige `DJANGO_SECRET_KEY`, `CEDULA_HMAC_KEY` y las credenciales de PostgreSQL.

### Producción (preparada)

Verificado localmente: las dos imágenes **construyen** (`docker build -f backend/Dockerfile.prod backend` y `docker build -f deploy/nginx/Dockerfile .`), la imagen final de Nginx no contiene Node, `nginx -t` es válido (con el host `backend` resoluble) y el backend corre como uid 10001 con los estáticos recopilados. **No** se levantó el conjunto `docker-compose.prod.yml` ni se probó en un servidor.

Componentes de `docker-compose.prod.yml`:
- `db`: PostgreSQL 16 + PostGIS 3.5 con volumen persistente y sin puertos publicados.
- `backend`: `backend/Dockerfile.prod` — Python 3.12, solo dependencias de ejecución, usuario sin privilegios (uid 10001), estáticos de Django recopilados en la construcción, **Gunicorn** (3 *workers*). Límites de recursos (2 CPU, 1 GB).
- `web`: `deploy/nginx/Dockerfile` — etapa de construcción con Node que compila el frontend; la imagen final es Nginx con los estáticos (Node no llega a producción). Hace de proxy de `/api/` hacia Gunicorn y aplica cabeceras de seguridad y CSP.

Pasos:
1. Crear `.env.produccion` (no versionado) a partir de `.env.example` con valores **nuevos** (no reutilice los del entorno local): `DJANGO_SETTINGS_MODULE=config.settings.production`, `DJANGO_SECRET_KEY` (≥ 50 caracteres aleatorios), `CEDULA_HMAC_KEY` (estable: si cambia, las huellas de cédula dejan de coincidir), `DJANGO_ALLOWED_HOSTS=dominio`, `DJANGO_TRUSTED_ORIGINS=https://dominio`, credenciales de base de datos y `VITE_MAP_STYLE_URL`.
2. Construir y levantar: `docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build`.
3. Migraciones como **paso controlado** (no automático): `docker compose -f docker-compose.prod.yml --env-file .env.produccion exec backend python manage.py migrate`. Revise antes `migrate --plan`; no hay migraciones destructivas automáticas.
4. Crear el primer administrador con un *shell* de Django o con un comando propio; **no ejecutar `seed_coac`** en producción (el comando se niega salvo `DEBUG=True` o `ALLOW_SEED=1` explícito). Cargar roles y permisos: ejecute una sola vez la parte de catálogo o exporte desde un entorno de pruebas (pendiente de procedimiento institucional).
5. HTTPS: terminar TLS en Nginx (agregar certificado) o en un balanceador delante, con `X-Forwarded-Proto`. Producción activa `SECURE_SSL_REDIRECT`, HSTS y cookies `Secure`. El modo campo sin conexión (si se enciende `habilitar_modo_offline`) **requiere HTTPS**: el navegador no registra *service workers* ni ofrece geolocalización fuera de un contexto seguro. `sw.js`, `workbox-*.js` y `manifest.webmanifest` se sirven desde la raíz con `Cache-Control: no-cache` (bloque `location /`), de modo que una versión nueva se detecta en la siguiente visita.

### Salud, logs y monitoreo
- `GET /api/v1/health/` comprueba la base de datos y PostGIS (503 si no responde). Los *healthcheck* de Compose lo usan (verificado en desarrollo).
- Logs estructurados en JSON por la salida estándar, con `correlation_id` (cabecera `X-Correlation-ID`, también devuelta en cada respuesta y guardada en el historial).

### Respaldo y restauración (documentado, **no probado**)
```bash
## Respaldo lógico comprimido
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > respaldo_$(date +%F).dump
## Restauración en una base vacía
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < respaldo_AAAA-MM-DD.dump
```
- El *trigger* del historial bloquea `TRUNCATE`/`DELETE`: restaure sobre una base nueva o desactive temporalmente el *trigger* como superusuario, y verifique después con `python manage.py verify_audit_chain`.
- Respalde también el volumen `private_uploads` solo si su política exige conservar archivos (la aplicación los elimina tras confirmar o cancelar cada carga).
- La frecuencia y la retención de respaldos dependen de la política institucional (pendiente).


> **Windows CMD:** los ejemplos anteriores usan sintaxis de shell Unix (`$(date ...)`) y redirecciones. Ejecutarlos desde Bash/WSL, o adaptar el nombre del archivo manualmente en CMD. La restauración no ha sido probada.

### Límites operativos
- Cargas síncronas: 20 MB y 100 000 filas por archivo (configurables en Parámetros). Un volumen mayor requeriría procesamiento asíncrono (Celery/Redis o similar), no incluido.
- Nginx: `client_max_body_size 25m`, `proxy_read_timeout 180s` para cargas grandes.
- Mapa: hasta 3 000 puntos individuales por consulta y `bbox` máximo de 0,6° (configurable).

### Recuperación ante fallos
- Todos los servicios con `restart: always`; el backend espera a que la base esté sana.
- Una carga que falla se revierte por completo y queda en estado `fallida`; puede volver a subirse.
- Mejora futura (no implementada): teselas vectoriales dinámicas con `ST_AsMVT` si el volumen de datos crece.


---

## Pendientes de validación y continuidad

La implementación documentada no sustituye la aprobación institucional ni una revisión técnica independiente. Antes de utilizar datos reales:

1. **Datos y reglas de negocio:** validar oficialmente zonas, fórmulas de indicadores, umbrales, pesos, permisos, periodicidad de visitas y criterios de duplicados.
2. **Seguridad y privacidad:** definir retención, respaldos, controles de acceso, respuesta a incidentes y revisión de dependencias; revisar especialmente el almacenamiento local del modo sin conexión.
3. **Integración:** la conexión directa con la base institucional (RF-005.05) figura como **bloqueada** por falta de origen de datos, credenciales y autorización.
4. **Pruebas:** ampliar E2E de carga, clasificación y reportes; probar rendimiento con datos y dispositivos representativos; ejecutar de nuevo las suites tras cualquier cambio.
5. **Producción:** verificar HTTPS, migraciones, creación inicial de administradores, restauración de backups, monitoreo y pruebas de recuperación en un servidor real.
6. **Modo sin conexión:** obtener autorización antes de habilitarlo; el PIN local y las teselas descargables no están incluidos.
---

## Anexo A: matriz de trazabilidad (111 RF)

Fuente: hojas `CU` y `Req Funcionales` del Excel `Interesados_Problemas_Necesidades_COAC_completo.xlsx` (21 casos de uso, 111 requisitos funcionales). Estados permitidos: `Pendiente`, `En progreso`, `Implementado`, `Probado`, `Bloqueado`. Un requisito solo es **Probado** si tiene prueba automatizada ejecutada en verde (ver sección «Verificación y pruebas»).

Pruebas: backend `backend/modules/.../tests` y `backend/tests` (pytest, PostGIS real); frontend `frontend/src/test` (Vitest) y `frontend/e2e` (Playwright). Resultados reales en la sección «Verificación y pruebas». **Probado** = prueba automatizada ejecutada en verde que cubre el requisito. **Implementado** = lógica en servidor e interfaz conectada, sin prueba dedicada. CU-17/18/20/21 son **condicionados**: implementados y apagados por defecto; sus pruebas activan el interruptor en la base de pruebas.

### Resumen

| Estado | Requisitos |
|---|---|
| Probado | 94 |
| Implementado | 16 |
| Bloqueado | 1 |
| **Total** | **111** |

### Casos de uso

| CU | Caso de uso | Actor | Paquete | Ruta / módulo |
|---|---|---|---|---|
| CU-01 | Iniciar sesión | Usuario registrado | PF-01 | /login |
| CU-02 | Gestionar usuarios, roles y permisos | Administrador de la plataforma | PF-01 | /usuarios |
| CU-03 | Cargar archivos CSV | Administrador de la plataforma | PF-02 | /datos/cargas, /datos/esquemas |
| CU-04 | Validar y depurar los datos cargados | Administrador de la plataforma | PF-02 | /datos/observados |
| CU-05 | Gestionar límites geográficos de las zonas | Administrador de la plataforma | PF-02 | /datos/limites |
| CU-06 | Consultar historial de cargas y cambios | Administrador de la plataforma | PF-02 | /historial |
| CU-07 | Consultar mapa de socios y créditos | Jefe de agencia | PF-03 | /mapa |
| CU-08 | Consultar mapa de calor y filtrar por zona | Jefe de agencia | PF-03 | /mapa |
| CU-09 | Consultar indicadores por zona y período | Jefe de agencia | PF-03 | /indicadores, /panel |
| CU-10 | Comparar la evolución de zonas en el tiempo | Jefe de agencia | PF-03 | /comparar |
| CU-11 | Definir criterios de clasificación de zonas | Jefatura de metodología de crédito | PF-04 | /criterios |
| CU-12 | Consultar clasificación y prioridad de zonas | Jefe de agencia | PF-04 | /clasificacion |
| CU-13 | Registrar ubicación de posibles socios | Oficial de crédito | PF-05 | /prospectos |
| CU-14 | Asignar zonas a oficiales de crédito | Jefe de agencia | PF-05 | /asignaciones |
| CU-15 | Consultar zonas asignadas y lista priorizada | Oficial de crédito | PF-05 | /mis-zonas |
| CU-16 | Organizar ruta de visitas | Oficial de crédito | PF-05 | /rutas |
| CU-17 | Registrar visita y resultado | Oficial de crédito | PF-05 | /visitas (condicionado) |
| CU-18 | Comparar visitas previstas y realizadas | Supervisor de apoyo metodológico | PF-05 | /seguimiento (condicionado) |
| CU-19 | Generar y consultar reportes por zona | Jefe de agencia | PF-06 | /reportes |
| CU-20 | Consultar zonas con mayor potencial de captación | Jefe de agencia | PF-07 | /potencial (condicionado) |
| CU-21 | Ejecutar procesos analíticos y configurar variables | Administrador de la plataforma | PF-07 | /analisis (condicionado) |

### CU-01 — Iniciar sesión

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-001.01 | Cuando el usuario ingrese su identificador y su contraseña y correspondan a una cuenta activa, el sistema debe permitir el acceso y mostrar únicamente las opciones habilitadas para su rol. | Probado | `/login`; menú por permisos | `modules/usuarios/tests/test_autenticacion.py::TestLogin`, `e2e/acceso-mapa.spec.js` |  |
| RF-001.02 | Si las credenciales son incorrectas o la cuenta está desactivada, el sistema debe denegar el acceso e informar que no fue posible iniciar sesión, sin indicar cuál de los datos fue el incorrecto. | Probado | Respuesta genérica; cuenta desactivada | `modules/usuarios/tests/test_autenticacion.py::TestLogin::test_respuesta_generica_sin_revelar_causa`, `e2e/acceso-mapa.spec.js` |  |
| RF-001.03 | Cuando el usuario solicite cerrar sesión, el sistema debe finalizarla e impedir el acceso a la información hasta que se inicie una nueva sesión. | Probado | Logout revoca refresh y sesión | `modules/usuarios/tests/test_autenticacion.py::TestSesion::test_logout_revoca_access_y_refresh`, `e2e/acceso-mapa.spec.js` |  |
| RF-001.04 | Cuando una sesión permanezca inactiva durante el tiempo definido por la cooperativa, el sistema debe cerrarla automáticamente. | Probado | Sesión de servidor + temporizador cliente | `modules/usuarios/tests/test_autenticacion.py::TestSesion::test_inactividad_cierra_la_sesion_en_servidor` | Minutos en Parámetros (15 por defecto) |
| RF-001.05 | El sistema debe registrar cada intento de inicio de sesión, exitoso o fallido, con el usuario, la fecha y la hora. | Probado | IntentoAcceso + historial `acceso` | `modules/usuarios/tests/test_autenticacion.py::TestLogin::test_registra_intentos_exitosos_y_fallidos_sin_contrasena` | Incluye bloqueo tras 5 fallos |

### CU-02 — Gestionar usuarios, roles y permisos

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-002.01 | Cuando el administrador solicite guardar un usuario nuevo y sus datos sean válidos, el sistema debe crear la cuenta con el nombre, el identificador, el cargo y el rol asignado. | Probado | `/usuarios` | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_crea_usuario_valido_y_audita` |  |
| RF-002.02 | El sistema debe permitir al administrador asignar a cada usuario un rol y un ámbito de responsabilidad (por ejemplo, agencia o zonas) que determinen qué información puede consultar y qué acciones puede realizar. | Probado | Rol + agencia (ámbito) + zonas asignadas | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_oficial_requiere_agencia`, `modules/analitica/tests/test_visualizacion.py::TestAmbitoEIdor` |  |
| RF-002.03 | Cuando el administrador modifique el rol o el ámbito de un usuario y confirme el cambio, el sistema debe aplicar los nuevos permisos desde el siguiente acceso de ese usuario. | Probado | Revoca sesiones al cambiar rol/ámbito | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_cambio_de_rol_revoca_sesiones_y_rige_en_siguiente_acceso` |  |
| RF-002.04 | Cuando el administrador desactive una cuenta, el sistema debe impedir su ingreso y conservar el historial de sus acciones. | Probado | Desactivar conserva historial | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_desactivar_impide_ingreso_y_conserva_historial` |  |
| RF-002.05 | Antes de guardar un usuario, el sistema debe comprobar que se hayan ingresado los datos obligatorios y que el identificador no esté repetido. Si alguna comprobación falla, debe impedir el guardado y señalar cada dato que requiere corrección. | Probado | Validación por campo | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_valida_obligatorios_y_duplicado_senalando_cada_campo` |  |
| RF-002.06 | El sistema debe registrar cada cambio en usuarios, roles y permisos con el responsable, la fecha y la hora. | Probado | Auditoría `usuarios` | `modules/usuarios/tests/test_usuarios.py::TestGestionUsuarios::test_editar_matriz_de_permisos_audita` |  |

### CU-03 — Cargar archivos CSV

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-003.01 | Cuando el administrador seleccione un archivo CSV y solicite cargarlo, el sistema debe leer su contenido y mostrar un resumen con el nombre del archivo y la cantidad de registros leídos antes de pedir la confirmación. | Probado | `/datos/cargas` con previsualización | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_flujo_completo_previsualiza_confirma_y_recalcula` |  |
| RF-003.02 | Al iniciar una carga, el sistema debe solicitar al administrador el tipo de información que contiene el archivo (socios, créditos o pagos) y el período al que corresponde. | Probado | Tipo y período obligatorios | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_rechaza_extension_tipo_y_periodo` |  |
| RF-003.03 | Si el archivo no tiene formato CSV o le faltan las columnas requeridas para el tipo de información elegido, el sistema debe rechazar la carga e indicar qué columnas faltan. | Probado | Columnas faltantes + mapeo manual | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_columnas_obligatorias_faltantes_y_mapeo_manual_con_alias`, `modules/cartera/tests/test_muestras.py` |  |
| RF-003.04 | Cuando el administrador confirme la carga, el sistema debe guardar los registros válidos y enviar los registros observados al proceso de validación. | Probado | Confirmación transaccional; observados a depuración | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_rollback_completo_si_falla_la_persistencia` |  |
| RF-003.05 | Después de procesar un archivo, el sistema debe informar al administrador cuántos registros se cargaron, cuántos quedaron observados y cuántos se rechazaron. | Probado | Resumen cargados/observados/rechazados | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_flujo_completo_previsualiza_confirma_y_recalcula` |  |
| RF-003.06 | El sistema debe registrar cada carga con el nombre del archivo, el responsable, la fecha, la hora y el período indicado. | Probado | CargaDatos + evento de auditoría | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_flujo_completo_previsualiza_confirma_y_recalcula` |  |

### CU-04 — Validar y depurar los datos cargados

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-004.01 | Al procesar una carga, el sistema debe comprobar que cada registro tenga los datos obligatorios del tipo de información cargado, incluida su ubicación o zona. | Probado | Obligatorios incl. ubicación | `modules/cartera/tests/test_muestras.py::test_socios_con_errores_se_clasifican` |  |
| RF-004.02 | El sistema debe identificar los registros repetidos según el criterio acordado con la cooperativa y marcarlos para revisión. | Probado | Duplicados en archivo y contra la base | `modules/cartera/tests/test_muestras.py::test_socios_con_errores_se_clasifican` | Criterio de duplicado propuesto (a validar) |
| RF-004.03 | El sistema debe comprobar que la ubicación o la dirección de cada registro permita situarlo dentro de una zona geográfica y marcar los que no cumplan. | Probado | Ubicación válida y dentro de zona | `modules/cartera/tests/test_muestras.py::test_socios_con_errores_se_clasifican` |  |
| RF-004.04 | Cuando el administrador consulte los registros observados, el sistema debe mostrar cada uno con el motivo de la observación y permitirle corregirlo, descartarlo o conservarlo. | Probado | `/datos/observados` | `modules/cartera/tests/test_cargas.py::TestObservados` |  |
| RF-004.05 | Cuando el administrador corrija un registro observado y confirme el cambio, el sistema debe volver a validarlo antes de incorporarlo a los mapas y a los indicadores. | Probado | Corrección revalidada | `modules/cartera/tests/test_cargas.py::TestObservados::test_corregir_revalida_y_excluye_mientras_no_sea_valido` |  |
| RF-004.06 | Mientras un registro no tenga una ubicación válida, el sistema debe excluirlo de los mapas y de los indicadores geográficos e informar cuántos registros se encuentran excluidos. | Probado | Excluidos de mapas/KPIs con conteo | `modules/cartera/tests/test_cargas.py::TestObservados::test_corregir_revalida_y_excluye_mientras_no_sea_valido` |  |

### CU-05 — Gestionar límites geográficos de las zonas

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-005.01 | Cuando el administrador cargue un archivo de límites geográficos de una fuente autorizada y sus datos sean válidos, el sistema debe guardar las divisiones por provincia, cantón, parroquia, barrio o sector. | Probado | `/datos/limites` (GeoJSON) | `modules/cartera/tests/test_cargas.py::TestLimites::test_vista_previa_y_confirmacion` | Límites del seed: DEMO (sintético) |
| RF-005.02 | El sistema debe asociar cada registro con la zona que corresponde a su ubicación según las divisiones geográficas vigentes. | Probado | Asignación espacial por lote | `modules/cartera/tests/test_indicadores.py::test_indicadores_precalculados_por_zona`, `modules/cartera/tests/test_cargas.py::TestObservados` |  |
| RF-005.03 | Antes de reemplazar las divisiones vigentes, el sistema debe mostrar al administrador un resumen de los cambios y solicitar su confirmación. | Probado | Vista previa + confirmación | `modules/cartera/tests/test_cargas.py::TestLimites::test_vista_previa_y_confirmacion` |  |
| RF-005.04 | Si el archivo de límites está incompleto o no puede interpretarse, el sistema debe rechazarlo, conservar las divisiones vigentes e indicar el motivo. | Probado | Rechazo conservando divisiones | `modules/cartera/tests/test_cargas.py::TestLimites::test_archivo_invalido_se_rechaza_y_conserva_divisiones` |  |
| RF-005.05 | Si la cooperativa aprueba la conexión directa con sus bases de datos, el sistema debe permitir al administrador configurar la fuente de datos y ejecutar la importación aplicando las mismas validaciones que en una carga de archivo CSV. | Bloqueado | `habilitar_conexion_bd` apagado; opción visible y bloqueada | `modules/cartera/tests/test_cargas.py::TestLimites::test_conexion_bd_bloqueada` | No existe sistema fuente ni credenciales aprobadas |

### CU-06 — Consultar historial de cargas y cambios

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-006.01 | Cuando el administrador abra el historial, el sistema debe mostrar las cargas y los cambios realizados con la fecha, la hora, el responsable y la acción efectuada. | Probado | `/historial` | `modules/auditoria/tests/test_auditoria.py::TestCadena::test_api_historial_filtra_y_es_solo_lectura` |  |
| RF-006.02 | El sistema debe permitir filtrar el historial por fecha, por usuario y por tipo de acción. | Probado | Filtros fecha/usuario/acción | `modules/auditoria/tests/test_auditoria.py::TestCadena::test_api_historial_filtra_y_es_solo_lectura` |  |
| RF-006.03 | Cuando el administrador seleccione una carga del historial, el sistema debe mostrar el nombre del archivo, el período y la cantidad de registros cargados, observados y rechazados. | Implementado | Detalle de carga (`/cargas/<id>/`) |  | Sin prueba dedicada |
| RF-006.04 | Cuando se modifique un registro, el sistema debe conservar el valor anterior, el valor nuevo, el responsable y la fecha del cambio. | Probado | Valor anterior/nuevo (personales enmascarados) | `modules/cartera/tests/test_cargas.py::TestCargaSocios::test_reimportacion_no_duplica_y_actualiza_cambios` | Compromiso en la sección «Seguridad y privacidad» |
| RF-006.05 | El sistema no debe permitir editar ni eliminar las entradas del historial. | Probado | Trigger + cadena de hash | `modules/auditoria/tests/test_auditoria.py` |  |

### CU-07 — Consultar mapa de socios y créditos

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-007.01 | Cuando el usuario abra el mapa, el sistema debe mostrar las zonas que correspondan a su rol y a su ámbito de responsabilidad. | Probado | Mapa filtrado por ámbito | `modules/analitica/tests/test_visualizacion.py::TestAmbitoEIdor::test_jefe_de_agencia_solo_ve_su_agencia`, `e2e/acceso-mapa.spec.js` |  |
| RF-007.02 | El sistema debe mostrar sobre el mapa la ubicación de los socios, o su cantidad por zona, según el nivel de acercamiento elegido por el usuario. | Probado | Coropleta/calor; puntos por zoom y bbox | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_puntos_individuales_por_rol_y_bbox`, `e2e/acceso-mapa.spec.js` |  |
| RF-007.03 | Cuando el usuario seleccione una zona, el sistema debe mostrar la cantidad de socios, el número de créditos y los montos de esa zona. | Probado | Detalle de zona | `modules/analitica/tests/test_visualizacion.py::TestAmbitoEIdor::test_jefe_de_agencia_solo_ve_su_agencia` |  |
| RF-007.04 | El sistema debe permitir filtrar el mapa por provincia, cantón, parroquia, barrio o sector, según la información disponible. | Implementado | Filtros encadenados en la barra superior |  | Parámetro `padre` usado en pruebas de API; sin E2E de los filtros |
| RF-007.05 | Si una zona no tiene datos para el período seleccionado, el sistema debe indicarlo en lugar de mostrar valores en cero. | Probado | «Sin datos» en vez de 0 | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_sin_datos_no_es_cero`, `src/test/componentes.test.jsx` |  |
| RF-007.06 | El sistema no debe mostrar al usuario datos fuera de los que su rol permite consultar. | Probado | Filtrado en servidor; IDOR | `modules/analitica/tests/test_visualizacion.py::TestAmbitoEIdor` |  |

### CU-08 — Consultar mapa de calor y filtrar por zona

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-008.01 | Cuando el usuario elija una variable (concentración de socios, número de créditos, monto de créditos o pagos atrasados) y un período, el sistema debe generar el mapa de calor correspondiente. | Probado | Variables del mapa de calor | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_mapa_devuelve_poligonos_calor_y_leyenda` |  |
| RF-008.02 | El sistema debe mostrar junto al mapa de calor una leyenda con los rangos de valores y su color. | Probado | Leyenda con los mismos cortes | `src/test/componentes.test.jsx`, `modules/analitica/tests/test_visualizacion.py::test_rangos_de_leyenda_crecientes` |  |
| RF-008.03 | Cuando el usuario aplique o cambie un filtro geográfico, el sistema debe actualizar el mapa de calor para mostrar solo la zona filtrada. | Implementado | `setData` al cambiar filtros |  | Sin E2E dedicada |
| RF-008.04 | Cuando el usuario seleccione un área del mapa de calor, el sistema debe mostrar el nombre de la zona y el valor de la variable elegida. | Implementado | Clic en zona → nombre y valor |  | Sin E2E dedicada |
| RF-008.05 | El sistema debe permitir cambiar de variable o de período sin salir del mapa. | Implementado | Variable/período sin salir del mapa |  | Sin E2E dedicada |
| RF-008.06 | Si no existen datos suficientes para la variable y el período elegidos, el sistema debe informarlo al usuario. | Probado | Datos insuficientes informados | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_sin_datos_no_es_cero` |  |

### CU-09 — Consultar indicadores por zona y período

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-009.01 | El sistema debe mostrar, para cada zona, el número de socios, los créditos entregados, el monto de cartera y la cantidad de créditos con pagos atrasados. | Probado | `/indicadores` | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_indicadores_ordenables_paginados_y_con_ultima_carga`, `modules/cartera/tests/test_indicadores.py` |  |
| RF-009.02 | El sistema debe permitir al usuario elegir la fecha o el período al que corresponden los indicadores. | Probado | Período (mes) | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_panel_kpis_con_variacion` |  |
| RF-009.03 | El sistema debe permitir ordenar y filtrar las zonas según cada indicador. | Probado | Orden y filtro por indicador | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_indicadores_ordenables_paginados_y_con_ultima_carga` |  |
| RF-009.04 | El sistema debe mostrar la fecha de la última carga que respalda los indicadores presentados. | Probado | Fecha de última carga | `modules/analitica/tests/test_visualizacion.py::TestMapaEIndicadores::test_indicadores_ordenables_paginados_y_con_ultima_carga`, `e2e/acceso-mapa.spec.js` |  |
| RF-009.05 | El sistema debe mostrar solo los indicadores de las zonas que el rol del usuario permite consultar. | Probado | Ámbito | `modules/analitica/tests/test_visualizacion.py::TestAmbitoEIdor::test_oficial_solo_ve_zonas_asignadas` |  |

### CU-10 — Comparar la evolución de zonas en el tiempo

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-010.01 | El sistema debe permitir al usuario seleccionar una o varias zonas y dos o más fechas o períodos para compararlos. | Probado | `/comparar` | `modules/analitica/tests/test_visualizacion.py::TestComparacion` |  |
| RF-010.02 | Cuando el usuario solicite la comparación, el sistema debe mostrar el valor de cada indicador en cada fecha o período y la diferencia entre ellos. | Probado | Valor por período y diferencia | `modules/analitica/tests/test_visualizacion.py::TestComparacion` |  |
| RF-010.03 | El sistema debe indicar si cada indicador aumentó, disminuyó o se mantuvo entre los períodos comparados. | Probado | Aumentó/disminuyó/se mantuvo | `modules/analitica/tests/test_visualizacion.py::TestComparacion`, `modules/cartera/tests/test_indicadores.py::test_tendencia` |  |
| RF-010.04 | Si falta información de alguno de los períodos seleccionados, el sistema debe indicarlo y no calcular la diferencia correspondiente. | Probado | Falta información sin diferencia | `modules/analitica/tests/test_visualizacion.py::TestComparacion` |  |
| RF-010.05 | El sistema debe permitir ver la comparación de los pagos atrasados de cada zona en el mapa de calor. | Implementado | Variable «Variación de pagos atrasados» en el mapa |  | Sin prueba dedicada |

### CU-11 — Definir criterios de clasificación de zonas

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-011.01 | Cuando la jefatura de metodología de crédito ingrese las variables, las reglas y las categorías de clasificación de zonas, el sistema debe guardarlas como una versión de criterios pendiente de aprobación. | Probado | `/criterios`: versión pendiente | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |
| RF-011.02 | Antes de guardar una versión de criterios, el sistema debe comprobar que cada categoría tenga una regla definida y que las reglas no se contradigan. Si alguna comprobación falla, debe impedir el guardado e indicar qué debe corregirse. | Probado | Validación de consistencia | `modules/clasificacion/tests/test_clasificacion.py::test_validacion_detecta_inconsistencias`, `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_version_inconsistente_no_se_guarda` |  |
| RF-011.03 | Cuando la jefatura de metodología de crédito apruebe una versión, el sistema debe usarla como la única versión vigente para clasificar las zonas. | Probado | Única versión vigente | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |
| RF-011.04 | Cuando se apruebe una nueva versión de criterios, el sistema debe recalcular la clasificación de las zonas y conservar las versiones anteriores. | Probado | Recálculo; versiones anteriores | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |
| RF-011.05 | El sistema debe registrar quién definió y quién aprobó cada versión de criterios, con la fecha y la hora. | Probado | Quién definió y aprobó | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |

### CU-12 — Consultar clasificación y prioridad de zonas

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-012.01 | Cuando el usuario abra la clasificación, el sistema debe mostrar cada zona con la categoría que le corresponde según los criterios vigentes. | Probado | `/clasificacion` | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |
| RF-012.02 | Cuando el usuario seleccione una zona, el sistema debe mostrar los indicadores y las reglas que explican su categoría. | Probado | Explicación por zona | `modules/clasificacion/tests/test_clasificacion.py::test_evaluacion_primera_que_cumple_y_sin_datos` |  |
| RF-012.03 | El sistema debe permitir filtrar las zonas por categoría y reconocer en el mapa las zonas con menor presencia de socios. | Implementado | Filtro por categoría y mapa por categoría |  | Sin E2E del mapa |
| RF-012.04 | El sistema debe mostrar la lista de zonas ordenadas según la atención que requieren. | Probado | Orden por atención | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_definir_aprobar_unica_vigente_y_recalcular` |  |
| RF-012.05 | Si no existe una versión de criterios aprobada, el sistema debe informar al usuario que no es posible clasificar las zonas. | Probado | Mensaje sin versión aprobada | `modules/clasificacion/tests/test_clasificacion.py::TestFlujoCriterios::test_sin_version_aprobada_informa` |  |

### CU-13 — Registrar ubicación de posibles socios

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-013.01 | Cuando un usuario autorizado elija registrar un posible socio, el sistema debe solicitar el nombre o la referencia del negocio, su ubicación (un punto en el mapa o una dirección) y, opcionalmente, una observación. | Probado | `/prospectos` (mapa o coordenadas) | `modules/campo/tests/test_campo.py::TestProspectos::test_registra_con_validacion_de_zona_y_es_idempotente` | La dirección se guarda como texto; no hay geocodificación |
| RF-013.02 | Antes de guardar, el sistema debe comprobar que la ubicación se encuentre dentro de una zona y sea suficientemente precisa. Si no lo es, debe impedir el guardado e indicarlo. | Probado | Zona y precisión | `modules/campo/tests/test_campo.py::TestProspectos::test_rechaza_ubicaciones_imprecisas_fuera_de_zona_o_ambito` |  |
| RF-013.03 | Cuando el usuario guarde el registro, el sistema debe asociarlo a la zona correspondiente y registrar el usuario, la fecha y la hora. | Probado | Zona, usuario y fecha | `modules/campo/tests/test_campo.py::TestProspectos::test_registra_con_validacion_de_zona_y_es_idempotente` |  |
| RF-013.04 | El sistema debe mostrar los posibles socios en el mapa diferenciados de los socios actuales. | Implementado | Capa ámbar diferenciada |  | Sin prueba visual automatizada |
| RF-013.05 | El sistema no debe ofrecer la opción de registrar ubicaciones a los usuarios que no tengan autorización para ello. | Probado | Sin opción para roles no autorizados | `modules/campo/tests/test_campo.py::TestProspectos::test_roles_sin_autorizacion_no_registran` |  |

### CU-14 — Asignar zonas a oficiales de crédito

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-014.01 | Cuando el jefe de agencia seleccione un oficial y una o más zonas y confirme la asignación, el sistema debe guardar las zonas asignadas a ese oficial. | Probado | `/asignaciones` | `modules/campo/tests/test_campo.py::TestAsignaciones::test_jefe_asigna_en_su_ambito_y_no_fuera` |  |
| RF-014.02 | El sistema debe mostrar al jefe de agencia las zonas asignadas a cada oficial de su agencia. | Probado | Zonas por oficial | `modules/campo/tests/test_campo.py::TestAsignaciones::test_jefe_asigna_en_su_ambito_y_no_fuera` |  |
| RF-014.03 | Cuando el jefe de agencia modifique o retire una asignación y confirme el cambio, el sistema debe actualizar las zonas del oficial. | Probado | Retirar asignación | `modules/campo/tests/test_campo.py::TestAsignaciones::test_jefe_asigna_en_su_ambito_y_no_fuera` |  |
| RF-014.04 | El sistema no debe permitir asignar zonas que estén fuera del ámbito de responsabilidad del jefe de agencia. | Probado | Fuera de ámbito rechazado | `modules/campo/tests/test_campo.py::TestAsignaciones::test_jefe_asigna_en_su_ambito_y_no_fuera` |  |
| RF-014.05 | El sistema debe registrar cada asignación, modificación o retiro con el responsable, la fecha y la hora. | Implementado | Auditoría `campo` |  | Evento registrado; sin aserción dedicada |

### CU-15 — Consultar zonas asignadas y lista priorizada

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-015.01 | Cuando el oficial de crédito consulte sus zonas, el sistema debe mostrar únicamente las zonas que tiene asignadas. | Probado | `/mis-zonas` | `modules/campo/tests/test_campo.py::TestAsignaciones::test_mis_zonas_solo_asignadas` |  |
| RF-015.02 | El sistema debe presentar al oficial las zonas asignadas ordenadas por prioridad, con su categoría y sus indicadores principales. | Probado | Orden, categoría e indicadores | `modules/campo/tests/test_campo.py::TestAsignaciones::test_mis_zonas_solo_asignadas` |  |
| RF-015.03 | Cuando el oficial seleccione una zona de la lista, el sistema debe mostrar el motivo por el que tiene esa prioridad. | Implementado | Motivo de prioridad |  | Reutiliza la explicación de RF-012.02 |
| RF-015.04 | Si la cooperativa define una frecuencia de visita para cada categoría de zona, el sistema debe mostrarla junto a cada zona de la lista. | Implementado | Frecuencia de visita |  | Frecuencias del seed: DEMO |
| RF-015.05 | El sistema debe permitir al jefe de agencia consultar la lista priorizada de cada oficial de su agencia. | Implementado | Lista priorizada por oficial |  | Sin prueba dedicada |

### CU-16 — Organizar ruta de visitas

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-016.01 | Cuando el oficial de crédito seleccione zonas de su lista para un recorrido, el sistema debe agregarlas a la ruta en preparación. | Probado | `/rutas` | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_ruta_solo_con_zonas_asignadas_y_orden_sugerido` |  |
| RF-016.02 | El sistema debe permitir al oficial ordenar las zonas de la ruta manualmente o aceptar el orden sugerido según su prioridad. | Probado | Orden manual o sugerido | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_ruta_solo_con_zonas_asignadas_y_orden_sugerido` |  |
| RF-016.03 | Cuando el oficial confirme la ruta, el sistema debe guardarla con las zonas seleccionadas, su orden y la fecha prevista. | Probado | Zonas, orden y fecha | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_ruta_solo_con_zonas_asignadas_y_orden_sugerido` |  |
| RF-016.04 | El sistema debe mostrar la ruta guardada en el mapa y como un listado ordenado de zonas. | Implementado | Mapa y listado de la ruta |  | Geometría probada en API; visual sin E2E |
| RF-016.05 | El sistema no debe permitir incluir en la ruta zonas que no estén asignadas al oficial. | Probado | Solo zonas asignadas | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_ruta_solo_con_zonas_asignadas_y_orden_sugerido` |  |

### CU-17 — Registrar visita y resultado

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-017.01 | Mientras la cooperativa no apruebe el registro de visitas, el sistema no debe habilitar esta función. | Probado | Bloqueo en frontend y backend | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_bloqueadas_si_no_estan_habilitadas`, `e2e/acceso-mapa.spec.js` | Condicionado (apagado por defecto) |
| RF-017.02 | Si la cooperativa aprueba el registro de visitas, cuando el oficial seleccione una zona o una ruta, el sistema debe solicitar la fecha de la visita, su resultado y, opcionalmente, observaciones. | Probado | Registro de visita | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto); resultados sujetos a aprobación |
| RF-017.03 | Antes de guardar una visita, el sistema debe comprobar que se hayan ingresado la fecha y el resultado. Si falta alguno, debe impedir el guardado y señalar el dato que requiere corrección. | Probado | Fecha y resultado obligatorios | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |
| RF-017.04 | Cuando el oficial guarde una visita, el sistema debe asociarla con la zona, con el oficial y, si existe, con la visita prevista de su ruta. | Probado | Asocia zona, oficial y ruta | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |
| RF-017.05 | El sistema debe permitir al oficial indicar que una visita prevista no se realizó y registrar el motivo. | Probado | No realizada con motivo | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |

### CU-18 — Comparar visitas previstas y realizadas

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-018.01 | Mientras la cooperativa no apruebe el registro de visitas, el sistema no debe habilitar esta función. | Probado | Bloqueo sin aprobación | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_bloqueadas_si_no_estan_habilitadas` | Condicionado (apagado por defecto) |
| RF-018.02 | Si la cooperativa aprueba el registro de visitas, cuando el supervisor elija un oficial, una agencia y un período, el sistema debe mostrar las visitas previstas, las realizadas y el porcentaje de visitas realizadas. | Probado | Previstas, realizadas y % | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |
| RF-018.03 | El sistema debe identificar las zonas con visitas previstas que aún no se han realizado. | Implementado | Zonas pendientes |  | Condicionado (apagado por defecto); sin aserción dedicada |
| RF-018.04 | Cuando el supervisor seleccione una zona y dos períodos, el sistema debe mostrar los indicadores de esa zona antes y después de las visitas. | Probado | Antes y después | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |
| RF-018.05 | Al mostrar la comparación antes y después, el sistema debe advertir que los cambios observados no demuestran por sí solos que se deban a las visitas. | Probado | Advertencia de no causalidad | `modules/campo/tests/test_campo.py::TestRutasYVisitas::test_visitas_habilitadas_validacion_seguimiento_y_advertencia` | Condicionado (apagado por defecto) |
| RF-018.06 | El sistema debe mostrar al supervisor únicamente la información de su ámbito de responsabilidad. | Implementado | Ámbito del supervisor |  | Condicionado (apagado por defecto); sin prueba dedicada |

### CU-19 — Generar y consultar reportes por zona

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-019.01 | Cuando el usuario elija el tipo de reporte (socios, créditos, pagos atrasados o clasificación), el nivel geográfico y el período, el sistema debe generar el reporte con la información disponible. | Probado | `/reportes` | `modules/reportes/tests/test_reportes.py::TestReportes` |  |
| RF-019.02 | El sistema debe incluir en cada reporte la fecha de generación, los filtros aplicados y la fecha de la última carga de datos utilizada. | Probado | Fecha, filtros y última carga | `modules/reportes/tests/test_reportes.py::TestReportes::test_csv_con_metadatos_y_solo_el_ambito` |  |
| RF-019.03 | El sistema debe permitir al usuario descargar el reporte en un formato de archivo acordado con la cooperativa. | Probado | CSV y PDF | `modules/reportes/tests/test_reportes.py::TestReportes::test_pdf_real` | Formato definitivo a acordar con la cooperativa |
| RF-019.04 | El sistema debe incluir en el reporte únicamente la información dentro del ámbito de responsabilidad del usuario. | Probado | Solo el ámbito | `modules/reportes/tests/test_reportes.py::TestReportes::test_csv_con_metadatos_y_solo_el_ambito` |  |
| RF-019.05 | Si no existen datos para los filtros seleccionados, el sistema debe informarlo en lugar de generar un reporte vacío. | Probado | Reporte vacío bloqueado | `modules/reportes/tests/test_reportes.py::TestReportes::test_reporte_vacio_se_bloquea_y_permisos` |  |

### CU-20 — Consultar zonas con mayor potencial de captación

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-020.01 | Mientras la cooperativa no apruebe el análisis predictivo o no existan datos suficientes, el sistema no debe habilitar esta función e informará el motivo. | Probado | Deshabilitado con motivo | `modules/reportes/tests/test_reportes.py::TestPotencial::test_deshabilitado_por_defecto_e_informa_motivo` | Condicionado (apagado por defecto) |
| RF-020.02 | Si la función está habilitada, cuando el usuario elija un período y un nivel geográfico, el sistema debe mostrar las zonas con su nivel de potencial estimado para captar nuevos socios. | Probado | Potencial por zona | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto); pesos DEMO |
| RF-020.03 | Cuando el usuario seleccione una zona, el sistema debe mostrar las variables y la fecha de los datos usados en la estimación. | Implementado | Variables y fecha de datos |  | Condicionado (apagado por defecto); sin prueba dedicada |
| RF-020.04 | El sistema debe presentar los resultados como estimaciones, diferenciados de los datos observados, e indicar que no son cifras confirmadas. | Probado | «Estimación no confirmada» | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |
| RF-020.05 | El sistema debe mostrar únicamente las zonas dentro del ámbito de responsabilidad del usuario. | Probado | Ámbito | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |

### CU-21 — Ejecutar procesos analíticos y configurar variables

| RF | Requisito | Estado | Implementación | Prueba | Nota |
|---|---|---|---|---|---|
| RF-021.01 | Mientras la cooperativa no apruebe el análisis predictivo, el sistema no debe habilitar esta función. | Probado | Deshabilitado sin aprobación | `modules/reportes/tests/test_reportes.py::TestPotencial::test_deshabilitado_por_defecto_e_informa_motivo` | Condicionado (apagado por defecto) |
| RF-021.02 | Si la función está habilitada, cuando el administrador seleccione las variables y los datos y solicite ejecutar el análisis, el sistema debe procesarlo y guardar el resultado con la fecha y el responsable. | Probado | Ejecución guardada con fecha y responsable | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |
| RF-021.03 | Antes de ejecutar un análisis, el sistema debe comprobar que existan datos suficientes y variables configuradas. Si no es así, debe impedir la ejecución e indicar qué falta. | Probado | Datos suficientes y variables configuradas | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |
| RF-021.04 | El sistema debe permitir al administrador configurar las variables analíticas y guardar los cambios como una versión. | Probado | Pesos versionados | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |
| RF-021.05 | El sistema debe registrar cada ejecución y cada cambio de variables con el responsable, la fecha y la hora. | Probado | Auditoría de ejecuciones y cambios | `modules/reportes/tests/test_reportes.py::TestPotencial::test_habilitado_valida_datos_suficientes_y_versiona` | Condicionado (apagado por defecto) |


### Requisitos adicionales (prototipo, encargo o propuestos)

| Elemento | Origen | Estado |
|---|---|---|
| Esquemas de carga editables con alias y campos adicionales (`/datos/esquemas`) | Encargo, sección 6.3 | Probado (`test_cargas.py::TestEsquemas`, `test_permiso_y_campo_adicional_en_atributos`) |
| Matriz de permisos editable por rol | Adicional del prototipo | Probado (`test_editar_matriz_de_permisos_audita`) |
| Avisos de pendientes (observados, criterios por aprobar) en la barra superior | Adicional del prototipo | Implementado |
| Distribución de zonas por categoría y penetración por parroquia en el Panel | Captura de diseño adaptada a datos reales | Implementado |
| Verificación de integridad del historial | Encargo, sección 5.2 | Probado |
| Modo campo sin conexión (Fase 8): service worker de estáticos, paquete por usuario con vencimiento, cola de salida con reintentos y «Sincronizar ahora», sincronización por lotes revalidada en servidor, ventana `horas_ventana_offline`, bloqueo por inactividad y borrado al cerrar sesión | Riesgo del Acta — **requisito adicional propuesto, pendiente de validación** | Probado con el interruptor encendido en pruebas (`modules/campo/tests/test_sincronizacion.py`, `frontend/src/test/offline.test.js`, `frontend/e2e/sin-conexion.spec.js`); **apagado por defecto** (`habilitar_modo_offline`). PIN local: pendiente de decisión institucional |
| Métricas de la captura sin respaldo (umbral SEPS, metas, ticket promedio, GPS de oficiales, % sincronizado) | Captura | No implementadas a propósito: no existen en los requisitos |
