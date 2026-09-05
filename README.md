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

### Pasos para el dueño del colmado

1. Obtener un **certificado digital** de una entidad autorizada por la DGII (por ejemplo la Cámara de Comercio o Avansi) y cargarlo en **Configuración → DGII** junto con su contraseña.
2. Registrar el **RNC** y la razón social en **Configuración → Negocio**.
3. Solicitar en la Oficina Virtual de la DGII los rangos de **e-NCF** y registrarlos en **Configuración → Secuencias e-NCF**.
4. Probar en el ambiente **TesteCF**, completar la certificación en **CerteCF** y finalmente cambiar a **eCF** (producción).
5. Mientras se completa ese proceso, el sistema puede operar en modo **NCF tradicional** (B01/B02) desde **Configuración → DGII → Modo**.

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
