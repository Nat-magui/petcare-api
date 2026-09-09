# PetCare API V1 — Specification

> **Estado:** baseline pre-implementación  
> **Propósito:** condensar en un único archivo operativo las decisiones congeladas de los Documentos 01, 02 y 03, sin agregar ni quitar comportamiento.  
> **Fuentes detalladas:**
> - Documento 01 — Especificación Funcional de la API (Contrato) v1.2
> - Documento 02 — Diccionario de Errores y Reglas de Negocio v1.1
> - Documento 03 — Diagramas de Flujo y Casos de Uso v1.1
>
> Cuando esta specification resume una regla, el detalle contractual permanece en los documentos anteriores.

---

## 1. Problema

La información básica de una mascota suele quedar distribuida entre libretas físicas, mensajes, fotografías o recuerdos de distintas personas. Esto se vuelve especialmente incómodo cuando la mascota vive en una familia, está al cuidado temporal de otra persona o proviene de una organización de rescate.

PetCare V1 centraliza esa información en una API backend segura y persistente. No reemplaza a una veterinaria ni incorpora lógica clínica.

---

## 2. Objetivo

Construir una API REST con NestJS que permita:

- registrar usuarios e iniciar sesión;
- renovar y cerrar sesión mediante access/refresh JWT;
- crear, consultar, editar y eliminar mascotas;
- compartir el acceso a una mascota entre varios usuarios mediante roles;
- crear, consultar, editar y eliminar vacunaciones;
- persistir datos en PostgreSQL mediante Prisma;
- proteger rutas, validar DTOs y aplicar seguridad HTTP básica;
- documentar el contrato mediante OpenAPI / Swagger UI;
- desplegar la API y PostgreSQL manteniendo persistencia.

La complejidad de V1 se concentra en modelado relacional, autenticación, autorización, validación y seguridad.

---

## 3. Actores

### Usuario no autenticado

Persona sin access token vigente. Puede utilizar `health`, `register` y `login`.

`refresh` y `logout` no requieren access token, pero sí un `refreshToken` válido en el body.

### Usuario autenticado

Persona con access token válido. Puede crear mascotas y utilizar recursos según su `PetAccess`.

### Roles sobre una mascota

| Rol | Permisos V1 |
|---|---|
| `OWNER` | Lectura y edición de mascota, CRUD de vacunaciones, gestión de accesos y eliminación de mascota. Puede haber más de uno. |
| `CAREGIVER` | Lectura y edición de datos básicos, CRUD de vacunaciones. No administra accesos ni elimina la mascota. |
| `VIEWER` | Solo lectura de mascota y vacunaciones. |

Relaciones humanas como “pareja”, “familiar”, “persona de respaldo” o “voluntario de ONG” no son roles técnicos. Los únicos roles técnicos de V1 son `OWNER`, `CAREGIVER` y `VIEWER`.

---

## 4. Recursos

### User

Cuenta de acceso.

Datos públicos: `id`, `name`, `email`, `createdAt`.

Datos sensibles internos: `passwordHash`, `refreshTokenHash`. Nunca se exponen en respuestas HTTP.

### Pet

Mascota gestionada por PetCare.

Campos funcionales:

- `id`
- `name`
- `species`: `DOG | CAT | OTHER`
- `breed`: `string | null`
- `birthDate`: `date | null`
- `careMode`: `FAMILY | FOSTER`
- `rescueOrganizationName`: `string | null`
- `createdAt`
- `updatedAt`
- `myRole` en respuestas, representando el rol del usuario actual.

`Pet` no contiene un único `ownerId`; la relación con usuarios se resuelve mediante `PetAccess`.

### PetAccess

Entidad intermedia explícita entre `User` y `Pet`.

Campos funcionales:

- `userId`
- `petId`
- `role`: `OWNER | CAREGIVER | VIEWER`
- `createdAt`

La combinación `userId + petId` debe ser única.

### Vaccination

Registro declarativo de vacunación.

Campos funcionales:

- `id`
- `petId`
- `vaccineName`
- `appliedAt`
- `nextDueAt`: `date | null`
- `veterinarianName`: `string | null`
- `clinicName`: `string | null`
- `notes`: `string | null`
- `createdAt`
- `updatedAt`

PetCare V1 no calcula calendarios clínicos ni prescribe próximas dosis.

---

## 5. Alcance

PetCare V1 incluye:

- NestJS 11 + TypeScript;
- Prisma + PostgreSQL;
- registro, login, access JWT, refresh JWT, logout y `GET /auth/me`;
- rutas privadas protegidas;
- CRUD de `Pet`;
- acceso compartido mediante `PetAccess`;
- roles `OWNER`, `CAREGIVER`, `VIEWER`;
- CRUD de `Vaccination`;
- validación global con `class-validator`, `class-transformer` y `ValidationPipe`;
- Helmet;
- CORS;
- rate limiting global y reforzado en `register/login`;
- manejo consistente de errores;
- Swagger / OpenAPI;
- Postman como herramienta de verificación;
- deploy de API y PostgreSQL;
- repositorio público con commits progresivos.

---

## 6. Fuera de alcance

No forman parte de PetCare V1:

- frontend web o móvil;
- organizaciones/ONG como entidad autenticable;
- invitaciones por email;
- adopciones o historial de custodia;
- veterinarias como recurso;
- turnos veterinarios;
- medical records o diagnósticos;
- medicamentos o tratamientos;
- fotos, documentos o almacenamiento de archivos;
- notificaciones o recordatorios;
- pagos;
- IA / RAG;
- paginación avanzada;
- filtros de vacunaciones “próximas” o “vencidas”;
- sesiones por dispositivo;
- blacklist de access JWT;
- rotación de refresh token en `/refresh`.

Una ONG puede aparecer únicamente como metadata opcional en `rescueOrganizationName`. Una persona vinculada a una ONG utiliza una cuenta `User` normal.

---

## 7. Reglas R1–R10

### R1 — Cuenta, email y contraseña

- El email es único y se normaliza a lowercase antes de consultar o persistir.
- La contraseña nunca se guarda en texto plano; se hashea con bcrypt.
- Login no revela si falló el email o la contraseña.

Referencia: `BR-AUTH-001` a `BR-AUTH-003`.

### R2 — Access, refresh y logout

- Toda ruta privada requiere access token válido.
- Access token: duración objetivo aproximada de 15 minutos.
- Refresh token: duración objetivo aproximada de 7 días.
- Solo se persiste el hash del refresh token.
- V1 mantiene un único refresh activo por usuario.
- Un nuevo login reemplaza el hash anterior.
- `/auth/refresh` no rota refresh y devuelve solo un nuevo `accessToken`.
- `/auth/logout` recibe `{ refreshToken }`, valida la sesión y deja `refreshTokenHash` en `null`.
- Un access JWT emitido puede seguir válido hasta expirar.

Referencia: `BR-AUTH-004` a `BR-AUTH-007`.

### R3 — Creación atómica de mascota

Crear `Pet` y crear el `PetAccess` del creador con rol `OWNER` forman una única operación de negocio. Si una escritura falla, se revierte toda la operación.

Referencia: `BR-PET-001`.

### R4 — Acceso por PetAccess

- Una mascota puede tener múltiples usuarios mediante `PetAccess`.
- Solo usuarios con `PetAccess` pueden consultar una mascota.
- `GET /pets` devuelve únicamente mascotas accesibles para el usuario autenticado.
- Si la mascota existe pero el usuario autenticado no posee `PetAccess`, V1 responde `403 PET_ACCESS_DENIED`.

Referencia: `BR-PET-002`, `BR-PET-003`.

### R5 — Permisos por rol

- `OWNER` y `CAREGIVER` pueden editar datos básicos de `Pet`.
- `VIEWER` solo consulta.
- Solo `OWNER` puede eliminar una mascota.
- `OWNER` y `CAREGIVER` pueden crear, editar y eliminar vacunaciones.
- `VIEWER` solo consulta vacunaciones.
- Solo `OWNER` puede listar, agregar, cambiar o quitar accesos.

Referencia: `BR-PET-004`, `BR-PET-006`, `BR-ACCESS-003`, `BR-VACC-002`.

### R6 — Último OWNER

Toda mascota debe conservar al menos un `OWNER`.

- Un OWNER puede modificar su propio rol o quitarse solo si queda al menos otro OWNER.
- Quitar o degradar al último OWNER responde `409 PET_LAST_OWNER`.
- Las operaciones que reducen OWNER se ejecutan en transacción serializable; ante conflicto concurrente se reintentan o fallan sin violar la invariante.
- Todos los OWNER tienen la misma autoridad.
- No existe `PRIMARY_OWNER` en V1.

Referencia: `BR-PET-005`, `BR-PET-008`, `BR-ACCESS-004`.

### R7 — Accesos compartidos

- Un usuario puede tener un solo `PetAccess` por mascota.
- Solo puede agregarse un usuario que ya tenga cuenta PetCare.
- El alta se realiza por email.
- Roles válidos: `OWNER`, `CAREGIVER`, `VIEWER`.
- Acceso duplicado: `409 PET_ACCESS_EXISTS`.
- Usuario inexistente: `404 USER_NOT_FOUND`.

Referencia: `BR-ACCESS-001` a `BR-ACCESS-005`.

### R8 — Datos de Pet y PATCH

- `birthDate`, si existe, no puede ser futura.
- En PATCH: campo omitido conserva; campo nullable enviado como `null` limpia; valor no nulo reemplaza.
- Las reglas cruzadas se validan sobre el estado final resultante de combinar registro persistido + DTO.

Referencia: `BR-PET-007`, `BR-DATA-001`, `BR-DATA-002`.

### R9 — Vaccination

- Toda vacunación pertenece a una mascota existente.
- `appliedAt` no puede ser futura.
- Si `nextDueAt` existe, debe ser igual o posterior a `appliedAt`.
- En PATCH, las fechas se validan sobre el estado final combinado.
- `/pets/:petId/vaccinations/:vaccinationId` solo opera si la vacunación pertenece a ese `petId`.
- No se incorpora lógica clínica.

Referencia: `BR-VACC-001` a `BR-VACC-006`.

### R10 — Validación, seguridad y errores

- Propiedades no declaradas en DTOs se rechazan.
- `ValidationPipe` global usa `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- `passwordHash`, `refreshTokenHash`, JWT y secretos nunca se exponen en respuestas ni logs.
- `register` y `login` tienen rate limit reforzado.
- Errores inesperados no exponen stack traces ni detalles internos.
- Los errores controlados usan `statusCode`, `code`, `error`, `message` y `details` opcional.

Referencia: `BR-SEC-001` a `BR-SEC-004`, `BR-DATA-001`, `BR-DATA-002`.

---

## 8. Endpoints esperados

### Health

| Método | Ruta | Auth | Éxito |
|---|---|---|---:|
| GET | `/api/v1/health` | Pública | 200 |

Respuesta: `{ "status": "ok" }`.

### Auth

| Método | Ruta | Auth | Éxito |
|---|---|---|---:|
| POST | `/api/v1/auth/register` | Pública | 201 |
| POST | `/api/v1/auth/login` | Pública | 200 |
| POST | `/api/v1/auth/refresh` | `refreshToken` en body | 200 |
| POST | `/api/v1/auth/logout` | `refreshToken` en body | 204 |
| GET | `/api/v1/auth/me` | Access token | 200 |

Contratos de sesión:

- `RegisterResponse = UserPublic`
- `LoginResponse = { accessToken, refreshToken, user }`
- `RefreshRequest = { refreshToken }`
- `RefreshResponse = { accessToken }`
- `LogoutRequest = { refreshToken }`
- `LogoutResponse = 204 No Content`

### Pets

| Método | Ruta | Permiso | Éxito |
|---|---|---|---:|
| POST | `/api/v1/pets` | Usuario autenticado | 201 |
| GET | `/api/v1/pets` | Cualquier PetAccess | 200 |
| GET | `/api/v1/pets/:petId` | Cualquier PetAccess | 200 |
| PATCH | `/api/v1/pets/:petId` | OWNER / CAREGIVER | 200 |
| DELETE | `/api/v1/pets/:petId` | OWNER | 204 |

### Pet Access

| Método | Ruta | Permiso | Éxito |
|---|---|---|---:|
| GET | `/api/v1/pets/:petId/access` | OWNER | 200 |
| POST | `/api/v1/pets/:petId/access` | OWNER | 201 |
| PATCH | `/api/v1/pets/:petId/access/:userId` | OWNER | 200 |
| DELETE | `/api/v1/pets/:petId/access/:userId` | OWNER | 204 |

`POST /access` agrega un usuario PetCare existente por email.

### Vaccinations

| Método | Ruta | Permiso | Éxito |
|---|---|---|---:|
| POST | `/api/v1/pets/:petId/vaccinations` | OWNER / CAREGIVER | 201 |
| GET | `/api/v1/pets/:petId/vaccinations` | OWNER / CAREGIVER / VIEWER | 200 |
| GET | `/api/v1/pets/:petId/vaccinations/:vaccinationId` | OWNER / CAREGIVER / VIEWER | 200 |
| PATCH | `/api/v1/pets/:petId/vaccinations/:vaccinationId` | OWNER / CAREGIVER | 200 |
| DELETE | `/api/v1/pets/:petId/vaccinations/:vaccinationId` | OWNER / CAREGIVER | 204 |

---

## 9. Errores

### Envelope estándar

```json
{
  "statusCode": 409,
  "code": "PET_LAST_OWNER",
  "error": "Conflict",
  "message": "La mascota debe conservar al menos un OWNER."
}
```

`details` es opcional y se usa principalmente para validaciones.

### Códigos HTTP

| HTTP | Uso |
|---|---|
| 400 | Request inválido o combinación de datos inválida |
| 401 | Identidad/sesión no válida |
| 403 | Usuario autenticado sin acceso o permiso |
| 404 | Recurso inexistente |
| 409 | Conflicto con el estado actual |
| 429 | Límite de solicitudes superado |
| 500 | Error interno inesperado |

### Códigos de aplicación V1

**Generales**

- `VALIDATION_ERROR`
- `INVALID_IDENTIFIER`
- `RATE_LIMIT_EXCEEDED`
- `INTERNAL_ERROR`

**Auth / User**

- `AUTH_EMAIL_IN_USE`
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCESS_REQUIRED`
- `AUTH_REFRESH_INVALID`
- `USER_NOT_FOUND`

**Pet / PetAccess**

- `PET_NOT_FOUND`
- `PET_ACCESS_DENIED`
- `PET_ROLE_FORBIDDEN`
- `PET_INVALID_BIRTH_DATE`
- `PET_ACCESS_EXISTS`
- `PET_ACCESS_NOT_FOUND`
- `PET_LAST_OWNER`

**Vaccination**

- `VACCINATION_NOT_FOUND`
- `VACCINATION_INVALID_DATES`

### Orden conceptual de resolución

1. Autenticación / Guard.
2. Pipes y validación de entrada.
3. Existencia del recurso.
4. Autorización de recurso y rol.
5. Conflictos de estado.
6. Persistencia / infraestructura.

---

## 10. Criterios de aceptación

- **AC-01:** un usuario puede registrarse con datos válidos y su password no queda en texto plano.
- **AC-02:** un usuario puede iniciar sesión y recibir access + refresh token.
- **AC-03:** refresh vigente genera un nuevo access token; logout vigente invalida `refreshTokenHash`; el access JWT previo puede vivir hasta expirar.
- **AC-04:** sin access token no se puede acceder a recursos privados.
- **AC-05:** crear una mascota crea también el acceso OWNER del creador de forma atómica.
- **AC-06:** un usuario ve únicamente mascotas para las que posee `PetAccess`.
- **AC-07:** OWNER puede administrar accesos y no puede dejar una mascota sin OWNER.
- **AC-08:** CAREGIVER puede mantener datos de mascota y vacunaciones, pero no accesos.
- **AC-09:** VIEWER solo puede consultar.
- **AC-10:** Pet CRUD funciona contra PostgreSQL real.
- **AC-11:** Vaccination CRUD funciona contra PostgreSQL real, rechaza `appliedAt` futura, respeta `nextDueAt >= appliedAt` y valida el estado final en PATCH.
- **AC-12:** DTOs inválidos y propiedades desconocidas son rechazados.
- **AC-13:** la API aplica Helmet, CORS y rate limiting.
- **AC-14:** Swagger permite descubrir y probar el contrato V1.
- **AC-15:** la API y PostgreSQL están desplegados y mantienen persistencia después de un reinicio.

---

## 11. Definition of Done

La Fase 1 queda cerrada cuando esta specification permite responder, sin depender de decisiones implícitas:

> **¿Qué tiene que hacer PetCare para considerarse terminado?**

PetCare V1 se considera terminado cuando puede demostrarse que:

- register, login, refresh, logout y `/auth/me` cumplen el contrato;
- passwords y refresh tokens se almacenan únicamente como hash;
- las rutas privadas exigen access JWT;
- Pet CRUD funciona contra PostgreSQL;
- crear Pet crea también su `PetAccess OWNER` de forma atómica;
- los usuarios solo ven mascotas para las que tienen `PetAccess`;
- OWNER, CAREGIVER y VIEWER respetan la matriz de permisos V1;
- no es posible dejar una mascota sin OWNER;
- PetAccess se administra únicamente por OWNER;
- Vaccination CRUD funciona y respeta sus reglas de fechas;
- PATCH respeta omitido=conservar, `null`=limpiar nullable y valor=reemplazar, validando reglas cruzadas sobre el estado final;
- los errores respetan el contrato estable de PetCare;
- `ValidationPipe`, Helmet, CORS y rate limiting están activos;
- Swagger refleja y permite probar el contrato V1;
- Postman puede reproducir el happy path y errores prioritarios definidos en el Documento 03;
- existe al menos un test automatizado del flujo de autenticación;
- la API y PostgreSQL están desplegados;
- los datos persisten después de un reinicio;
- el repositorio público contiene código, `schema.prisma`, `README.md`, `.env.example` y commits progresivos;
- no se incorporaron funcionalidades declaradas fuera de alcance.

### Regla de cambio

Cualquier cambio que altere recursos, permisos, campos obligatorios, endpoints o criterios `AC-*` debe actualizar primero la documentación contractual correspondiente. Los códigos de error y reglas `BR-*` deben mantenerse sincronizados con el contrato HTTP.
