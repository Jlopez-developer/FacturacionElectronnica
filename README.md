# Mi Colmado — Sistema de Facturación Electrónica (DGII)

Sistema de facturación para colmados de República Dominicana con **facturación electrónica (e-CF)**
integrada a los servicios web de la **DGII**: firma digital XMLDSig, envío, consulta de estado,
notas de crédito electrónicas, QR de consulta en el ticket y reportes 606/607.

El dashboard reproduce el boceto entregado (ventas de hoy y del mes, facturas, productos, clientes,
gráfico de 7 días, productos más vendidos, ventas por categoría, últimas facturas y accesos rápidos).

## Requisitos

- Node.js 20 o superior
- Impresora térmica (opcional): USB (imprime desde el navegador) o de red ESC/POS (puerto 9100)

## Instalación y arranque

```bash
npm install
npm run seed     # (opcional) datos de demostración: 268 productos, 156 clientes, ventas, caja abierta
npm start        # http://localhost:3000
```

Usuario inicial: `admin` / `admin123` (cámbielo en **Usuarios**). Con los datos de demostración
también existen `cajero` / `cajero123` y `supervisor` / `super123`.

Variables opcionales: `PORT` (3000), `DATA_DIR` (carpeta de la base de datos y certificados),
`ADMIN_PASSWORD` (clave del admin inicial).

## Puesta en marcha (asistente de configuración)

Al entrar por primera vez como administrador, el sistema abre el **asistente de puesta en marcha**
(también disponible en **Configuración → Asistente de puesta en marcha** o en `#/asistente`). En 5 pasos deja todo listo:

1. **Negocio**: nombre comercial, razón social, RNC (se valida el dígito verificador), dirección, teléfono.
2. **DGII**: modo (e-CF, NCF tradicional o sin comprobantes), ambiente (TesteCF / CerteCF / eCF), carga del
   certificado digital `.p12` con su contraseña, URLs de los servicios (opcional, por si la DGII las cambia) y
   **Probar conexión**, que solicita la semilla, la firma y obtiene el token real de la DGII.
3. **Comprobantes**: rangos de e-NCF autorizados (desde, hasta, vencimiento) por tipo: 32 consumo, 31 crédito fiscal, 34 nota de crédito, etc.
4. **Impresión**: impresora (navegador o térmica de red), ancho de papel, cajón de dinero y pie del ticket, con ticket de ejemplo.
5. **Usuarios**: cambio de la contraseña inicial del administrador y alta de cajeros.

El paso final muestra un **checklist** con lo que falta. El dashboard muestra un aviso hasta que todo esté completo,
y la API expone el estado en `GET /api/configuracion/estado`.

## Módulos

| Módulo | Qué hace |
|---|---|
| Dashboard | Resumen del día y del mes, gráfico de 7 días, top 5 productos, categorías, últimas facturas, accesos rápidos, estado de la caja |
| Facturación | Punto de venta: búsqueda por nombre o código de barras, cliente, Consumo (32) o Crédito Fiscal (31), efectivo/tarjeta/transferencia/crédito, cambio, impresión de ticket |
| Productos | Catálogo, categorías, ITBIS (18 %, 16 %, exento), stock y stock mínimo, ajustes de inventario |
| Clientes | Registro con validación de RNC (módulo 11) y cédula (Luhn); historial de compras |
| Ventas | Facturas emitidas, estado ante la DGII, reenvío/consulta, XML firmado, anulación con **Nota de Crédito electrónica (34)** |
| Compras | Compras a suplidores con NCF (alimenta el 606) y actualización de inventario y costos |
| Gastos | Gastos por categoría, con NCF para el 606; los pagados en efectivo se descuentan de la caja |
| Reportes | Ventas por día, forma de pago, tipo de comprobante y cajero; ITBIS cobrado; ganancia; inventario; exportación **606** y **607** en CSV |
| Caja | Apertura con fondo inicial, entradas/salidas, cierre con efectivo esperado vs contado, historial, apertura del cajón |
| Usuarios | Roles administrador / supervisor / cajero |
| Configuración | Datos del negocio, DGII (modo, ambiente, certificado digital, envío automático), secuencias e-NCF, impresión |

## Integración con la DGII (facturación electrónica)

Flujo implementado en `server/dgii/`:

1. **Comprobante**: se reserva el próximo e-NCF de la secuencia (`E31…`, `E32…`, `E34…`) según el rango autorizado (`ncf.js`).
2. **XML e-CF**: se construye el XML con el formato ECF v1.0 de la DGII (encabezado, emisor, comprador, totales por tasa de ITBIS, detalle de ítems, referencia para notas de crédito) en `ecf.js`.
3. **Firma digital**: XMLDSig enveloped, RSA-SHA256, C14N, con el certificado `.p12` del contribuyente (`firma.js`). Los primeros 6 caracteres de la firma son el **código de seguridad** del ticket.
4. **Envío** (`cliente.js`):
   - Autenticación: semilla → semilla firmada → token.
   - Facturas de consumo menores a RD$ 250,000: se envía el **Resumen de Factura de Consumo (RFCE)** con respuesta inmediata.
   - Los demás e-CF: recepción (TrackId) y consulta del estado (Aceptado / Aceptado condicional / Rechazado / En proceso).
5. **Reintentos**: los e-CF no enviados o con error se reintentan cada 10 minutos y desde **Ventas → Reenviar pendientes**.
6. **Ticket**: representación impresa con e-NCF, código de seguridad, fecha de firma y **QR** con la URL de consulta de la DGII (`ConsultaTimbre` / `ConsultaTimbreFC`).

### Lo que el dueño del colmado debe conseguir (fuera del sistema)

1. Un **certificado digital** para facturación electrónica, emitido a nombre del contribuyente por una entidad
   autorizada por la DGII (Cámara de Comercio de Santo Domingo, Avansi, etc.). Se entrega como archivo `.p12` con contraseña.
2. Estar inscrito como emisor de e-CF en la Oficina Virtual de la DGII y solicitar allí los rangos de **e-NCF**.
3. Pasar la **certificación** de la DGII: se prueba en TesteCF, se completa el set de pruebas en CerteCF y la DGII habilita eCF (producción).

Todo lo demás se configura desde el asistente. Mientras se completa ese proceso, el sistema puede operar en modo
**NCF tradicional** (B01/B02) desde el paso DGII del asistente.

Sin certificado cargado, las facturas se emiten igual y el XML queda pendiente de firma y envío; el estado se ve en **Ventas**.

## Pruebas

```bash
npm test
```

Cubren validación de RNC/cédula, formato y reserva de e-NCF, cálculo de totales e ITBIS,
estructura del XML e-CF y de la nota de crédito, URL del QR y la firma XMLDSig (verificada con el certificado).

## Estructura

```
server/
  index.js          servidor Express y arranque
  db.js             SQLite (better-sqlite3), esquema y configuración
  auth.js           sesiones y roles
  seed.js           datos de demostración
  dgii/             ncf.js, ecf.js, firma.js, cliente.js, rnc.js, index.js
  routes/           auth, dashboard, catalogos, facturas, operaciones, admin
public/
  index.html, css/app.css, js/ (app, ui, api, icons, pages/*)
test/               pruebas unitarias (node --test)
data/               base de datos y certificados (no se versionan)
```
