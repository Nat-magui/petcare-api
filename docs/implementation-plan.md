# PetCare API V1 — Implementation Plan

> **Estado:** plan de implementación pre-código  
> **Fuente funcional:** `docs/specification.md`  
> **Documentación detallada:** Documentos 01, 02 y 03  
> **Metodología:** Specification-Driven Development (SDD)

---

## 0. Regla general — Scope Freeze

Desde el comienzo de la implementación se toma como baseline:

```text
Documento 01 → Contrato funcional
Documento 02 → Reglas de negocio y errores
Documento 03 → Flujos y casos de uso
docs/specification.md → resumen operativo
```

Dominio V1 congelado:

```text
User
Pet
PetAccess
Vaccination
```

Roles:

```text
OWNER
CAREGIVER
VIEWER
```

No se agregan nuevas features de dominio durante el MVP.

Ideas como:

- turnos;
- notificaciones;
- emails;
- veterinarias;
- organizaciones;
- uploads;
- IA;
- filtros upcoming/overdue;
- frontend;

quedan para **PetCare V2**.

Si durante la implementación aparece una ambigüedad real, se detiene la tarea y se revisa la specification antes de inventar comportamiento.

---

# Fase 1 — Repositorio y bootstrap de NestJS

## Objetivo

Tener un proyecto NestJS limpio, compilando, versionado y con health check antes de implementar lógica de negocio.

## Trabajo

Crear un repositorio público nuevo.

Inicializar NestJS 11 + TypeScript con:

```text
pnpm
ESM
Vitest
```

No habilitar observabilidad auto-instrumentada en esta V1.

Estructura inicial esperada:

```text
petcare-api/
├── AGENTS.md
├── README.md
├── docs/
│   ├── specification.md
│   ├── implementation-plan.md
│   ├── 01-functional-specification.pdf
│   ├── 02-business-rules-errors.pdf
│   └── 03-use-cases-flows.pdf
├── src/
├── prisma/
├── test/
├── .env.example
├── .gitignore
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

Configurar:

```text
ConfigModule
global prefix: /api/v1
.env
.env.example
ESLint
```

Crear:

```http
GET /api/v1/health
```

Respuesta:

```json
{
  "status": "ok"
}
```

## Definition of Done

```text
✅ repo público
✅ proyecto ejecuta
✅ pnpm lint pasa
✅ pnpm build pasa
✅ GET /api/v1/health → 200
✅ .env ignorado
✅ .env.example presente
✅ documentación versionada
```

## Commit sugerido

```text
chore: initialize PetCare API
```

---

# Fase 2 — PostgreSQL + Prisma

## Objetivo

Materializar el modelo de datos definido por la specification en PostgreSQL.

## Trabajo

Levantar PostgreSQL local con Docker.

Configurar:

```text
Prisma
PrismaModule
PrismaService
DATABASE_URL
```

Modelos:

### User

```text
id
name
email UNIQUE
passwordHash
refreshTokenHash?
createdAt
updatedAt
```

### Pet

```text
id
name
species
breed?
birthDate?
careMode
rescueOrganizationName?
createdAt
updatedAt
```

### PetAccess

```text
userId FK
petId FK
role
createdAt
```

Restricción:

```text
UNIQUE(userId, petId)
```

### Vaccination

```text
id
petId FK
vaccineName
appliedAt
nextDueAt?
veterinarianName?
clinicName?
notes?
createdAt
updatedAt
```

Relaciones:

```text
User N ───── N Pet
       mediante
       PetAccess

Pet 1 ───── N Vaccination
```

No existe:

```text
Pet.ownerId
```

El ownership se representa con:

```text
PetAccess.role = OWNER
```

Fechas de negocio:

```text
birthDate
appliedAt
nextDueAt
```

se modelan como fechas, no timestamps de negocio.

Definir explícitamente:

```text
PK
FK
UNIQUE
relations
onDelete
indexes
timestamps
```

Crear y aplicar la migración inicial.

## Definition of Done

```text
✅ PostgreSQL conectado
✅ schema.prisma válido
✅ relaciones correctas
✅ UNIQUE(userId, petId)
✅ cascadas definidas
✅ migración creada
✅ migración aplicada
✅ Prisma Client funcionando
✅ Prisma Studio permite inspeccionar tablas
```

## Commits sugeridos

```text
feat: configure Prisma and PostgreSQL

feat: add PetCare database schema
```

---

# Fase 3 — Validación global y contrato de errores

## Objetivo

Construir correctamente la frontera HTTP antes de Auth y CRUD.

## Trabajo

Instalar/configurar:

```text
class-validator
class-transformer
ValidationPipe
```

Configuración global:

```ts
ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Implementar:

```text
exceptionFactory del ValidationPipe
+
ExceptionFilter global liviano
```

Contrato:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "Los datos enviados no son válidos.",
  "details": []
}
```

No crear un framework de errores innecesariamente complejo.

## Pruebas manuales

Propiedad inválida:

```json
{
  "name": 123
}
```

→ `400`

Propiedad extra:

```json
{
  "email": "x@example.com",
  "isAdmin": true
}
```

→ `400 VALIDATION_ERROR`

## Definition of Done

```text
✅ DTO inválido → 400
✅ propiedad extra → 400
✅ formato de error consistente
✅ details disponible para validación
✅ errores internos no exponen stack traces
```

---

# Fase 4 — UsersModule interno

## Objetivo

Crear la infraestructura mínima de usuarios necesaria para Auth y PetAccess.

No existe CRUD público de User.

## UsersService mínimo

```text
findByEmail()
findById()
create()
updateRefreshTokenHash()
clearRefreshTokenHash()
```

Más adelante PetAccess podrá reutilizar búsqueda por email.

## Definition of Done

```text
✅ UsersModule
✅ UsersService
✅ acceso a Prisma encapsulado
✅ passwordHash nunca se expone
✅ refreshTokenHash nunca se expone
```

---

# Fase 5 — Auth: Register

## Endpoint

```http
POST /api/v1/auth/register
```

DTO:

```text
name
email
password
```

Flujo:

```text
Request
  ↓
RegisterDto
  ↓
ValidationPipe
  ↓
AuthController
  ↓
AuthService
  ↓
normalizar email
  ↓
¿email existe?
├── sí → 409 AUTH_EMAIL_IN_USE
└── no
     ↓
bcrypt.hash()
     ↓
UsersService
     ↓
Prisma
     ↓
201
```

Respuesta:

```json
{
  "id": "...",
  "name": "Maga",
  "email": "maga@example.com",
  "createdAt": "..."
}
```

Nunca devolver:

```text
password
passwordHash
refreshTokenHash
```

## Definition of Done

```text
✅ registro válido → 201
✅ email repetido → 409
✅ password inválida → 400
✅ email normalizado lowercase
✅ password persistida como hash
✅ hashes no aparecen en response
```

## Commit sugerido

```text
feat: implement user registration with bcrypt
```

---

# Fase 6 — Auth: Login + access/refresh

## Endpoint

```http
POST /api/v1/auth/login
```

Flujo:

```text
email + password
      ↓
buscar User
      ↓
bcrypt.compare()
      ↓
credentials incorrectas
      → 401 AUTH_INVALID_CREDENTIALS
      ↓
generar access token
generar refresh token
      ↓
hash(refreshToken)
      ↓
guardar refreshTokenHash
      ↓
200
```

Respuesta:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "name": "Maga",
    "email": "maga@example.com",
    "createdAt": "..."
  }
}
```

Objetivo:

```text
access ≈ 15 min
refresh ≈ 7 días
```

Regla V1:

```text
1 usuario
→ 1 refresh activo
```

Un nuevo login reemplaza el hash anterior.

## Definition of Done

```text
✅ credenciales correctas → 200
✅ access + refresh generados
✅ credenciales incorrectas → 401
✅ login no revela si falló email/password
✅ refresh almacenado hasheado
✅ token/hash nunca se loguean
```

---

# Fase 7 — JWT Guard + rutas privadas

## Objetivo

Saber quién realiza cada request antes de implementar Pets.

Diseño:

```text
secure by default
```

Rutas públicas:

```text
GET  /health
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
Swagger
```

El resto requiere access token.

Agregar:

```http
GET /api/v1/auth/me
```

## Definition of Done

```text
✅ access válido → request continúa
✅ access ausente → 401 AUTH_ACCESS_REQUIRED
✅ access inválido → 401
✅ access expirado → 401
✅ /auth/me → UserPublic
✅ hashes nunca aparecen
```

---

# Fase 8 — Refresh + Logout

## Refresh

```http
POST /api/v1/auth/refresh
```

Body:

```json
{
  "refreshToken": "..."
}
```

Proceso:

```text
validar JWT
↓
buscar User
↓
bcrypt.compare(refreshToken, refreshTokenHash)
↓
si coincide
↓
nuevo accessToken
```

Respuesta:

```json
{
  "accessToken": "..."
}
```

No hay rotación de refresh en V1.

## Logout

```http
POST /api/v1/auth/logout
```

Body:

```json
{
  "refreshToken": "..."
}
```

Si es válido:

```text
refreshTokenHash = null
```

Respuesta:

```http
204 No Content
```

Semántica:

```text
logout revoca refresh
access existente puede vivir hasta expirar
```

## Definition of Done — Auth completo

```text
✅ register
✅ login
✅ /auth/me
✅ refresh
✅ logout
✅ refresh revocado → 401
✅ nuevo login invalida refresh anterior
```

## Commit sugerido

```text
feat: implement JWT access and refresh authentication
```

---

# CHECKPOINT 1 — AUTH DONE

No avanzar con Pets si Auth no está estable.

Debe poder demostrarse:

```text
Register
↓
Login
↓
GET /auth/me
↓
Refresh
↓
Logout
↓
reusar refresh → 401
```

---

# Fase 9 — Pet CRUD: Create

## Endpoint

```http
POST /api/v1/pets
```

DTO:

```text
name
species
breed?
birthDate?
careMode
rescueOrganizationName?
```

Al crear:

```text
crear Pet
+
crear PetAccess
role = OWNER
userId = currentUser.id
```

Debe ser atómico.

```text
BEGIN
  create Pet
  create PetAccess OWNER
COMMIT
```

## Definition of Done

```text
✅ autenticado crea Pet
✅ Pet se persiste
✅ crea PetAccess OWNER
✅ respuesta contiene myRole=OWNER
✅ si una escritura falla → rollback
✅ no autenticado → 401
✅ birthDate futura → 400 PET_INVALID_BIRTH_DATE
```

## Commit sugerido

```text
feat: create pets with owner access
```

---

# Fase 10 — Pet CRUD completo

Endpoints:

```http
GET    /api/v1/pets
GET    /api/v1/pets/:petId
PATCH  /api/v1/pets/:petId
DELETE /api/v1/pets/:petId
```

## GET /pets

Solo devuelve Pets con:

```text
PetAccess.userId = currentUser.id
```

## PATCH

Permitido:

```text
OWNER
CAREGIVER
```

VIEWER:

```text
403 PET_ROLE_FORBIDDEN
```

Semántica PATCH:

```text
omitido → conservar
null → limpiar campo nullable
valor → reemplazar
```

## DELETE

Solo:

```text
OWNER
```

Eliminación:

```text
Pet
├── PetAccess
└── Vaccination
```

sin filas huérfanas.

## Definition of Done

```text
✅ create
✅ list
✅ detail
✅ patch
✅ delete
✅ solamente mascotas accesibles
✅ VIEWER no modifica
✅ CAREGIVER no elimina
✅ outsider → 403 PET_ACCESS_DENIED
```

---

# Fase 11 — PetAccess

Endpoints:

```http
GET    /api/v1/pets/:petId/access
POST   /api/v1/pets/:petId/access
PATCH  /api/v1/pets/:petId/access/:userId
DELETE /api/v1/pets/:petId/access/:userId
```

Solo OWNER administra accesos.

## Agregar acceso

```json
{
  "email": "caregiver@example.com",
  "role": "CAREGIVER"
}
```

El usuario destino debe existir previamente.

Evitar duplicados:

```text
UNIQUE(userId, petId)
```

## Último OWNER

Nunca permitir:

```text
OWNER count → 0
```

Las operaciones que reducen OWNER deben usar transacción con aislamiento:

```text
Serializable
```

Flujo:

```text
transaction
↓
cargar acceso
↓
contar OWNER
↓
validar
↓
update/delete
↓
commit
```

Si dejaría cero OWNER:

```text
409 PET_LAST_OWNER
```

Todos los OWNER tienen la misma autoridad.

No existe:

```text
PRIMARY_OWNER
```

## Definition of Done

```text
✅ OWNER lista accesos
✅ OWNER agrega usuario
✅ OWNER cambia rol
✅ OWNER elimina acceso
✅ CAREGIVER → 403
✅ VIEWER → 403
✅ duplicado → 409 PET_ACCESS_EXISTS
✅ usuario inexistente → 404 USER_NOT_FOUND
✅ último OWNER no se quita/degrada
```

## Commit sugerido

```text
feat: implement shared pet access roles
```

---

# CHECKPOINT 2 — AUTHORIZATION DONE

Debe poder demostrarse:

```text
OWNER crea Pet

OWNER agrega:
├── CAREGIVER
└── VIEWER

CAREGIVER ve y edita Pet
VIEWER ve Pet
VIEWER no edita Pet
OUTSIDER no accede

OWNER administra accesos
CAREGIVER/VIEWER no
```

---

# Fase 12 — Vaccination Create

## Endpoint

```http
POST /api/v1/pets/:petId/vaccinations
```

Permitido:

```text
OWNER
CAREGIVER
```

No permitido:

```text
VIEWER
OUTSIDER
```

DTO:

```text
vaccineName
appliedAt
nextDueAt?
veterinarianName?
clinicName?
notes?
```

Reglas:

```text
appliedAt <= hoy
```

Si existe `nextDueAt`:

```text
nextDueAt >= appliedAt
```

## Definition of Done

```text
✅ OWNER crea
✅ CAREGIVER crea
✅ VIEWER → 403
✅ OUTSIDER → 403
✅ appliedAt futura → 400
✅ nextDueAt < appliedAt → 400
✅ Pet inexistente → 404
```

---

# Fase 13 — Vaccination CRUD completo

Endpoints:

```http
GET    /api/v1/pets/:petId/vaccinations
GET    /api/v1/pets/:petId/vaccinations/:vaccinationId
PATCH  /api/v1/pets/:petId/vaccinations/:vaccinationId
DELETE /api/v1/pets/:petId/vaccinations/:vaccinationId
```

Muy importante:

```text
vaccinationId
+
petId
```

deben corresponder.

No alcanza con buscar solo:

```text
Vaccination.id
```

## PATCH

Construir:

```text
existing
+
dto
=
finalState
```

Validar sobre `finalState`:

```text
appliedAt <= hoy
nextDueAt >= appliedAt
```

si corresponde.

## Definition of Done

```text
✅ CRUD completo
✅ acceso por PetAccess
✅ VIEWER solamente lectura
✅ OWNER/CAREGIVER escriben
✅ PATCH mantiene invariantes
✅ vacuna de otra mascota → 404 VACCINATION_NOT_FOUND
```

## Commit sugerido

```text
feat: implement vaccination CRUD
```

---

# CHECKPOINT 3 — DOMAIN DONE

A esta altura:

```text
CRUD #1 → Pet ✅
CRUD #2 → Vaccination ✅
Auth ✅
Authorization ✅
PostgreSQL ✅
```

Desde acá no se agregan nuevas features de dominio.

---

# Fase 14 — Security Hardening

Aplicar/revisar:

```text
Helmet
CORS explícito
Throttler global
Throttler reforzado en register/login
ConfigModule
```

Nunca:

```text
password en logs
passwordHash en responses
refresh tokens en logs
JWT en logs
DATABASE_URL completa en logs
secrets hardcodeados
stack traces en producción
```

## Definition of Done

```text
✅ Helmet
✅ CORS
✅ throttling
✅ auth throttling reforzado
✅ secrets solo en env
✅ .env.example
✅ respuestas sanitizadas
```

## Commit sugerido

```text
feat: apply API security hardening
```

---

# Fase 15 — Tests

No se busca 100% de cobertura.

Los tests se agregan progresivamente, pero esta fase consolida la suite crítica.

Casos mínimos:

| Test | Esperado |
|---|---:|
| register válido | 201 |
| email repetido | 409 |
| login inválido | 401 |
| ruta privada sin JWT | 401 |
| refresh revocado | 401 |
| OWNER crea Pet | 201 |
| VIEWER intenta editar Pet | 403 |
| OUTSIDER consulta Pet | 403 |
| acceso duplicado | 409 |
| quitar último OWNER | 409 |
| CAREGIVER crea Vaccination | 201 |
| VIEWER crea Vaccination | 403 |
| appliedAt futura | 400 |
| nextDueAt < appliedAt | 400 |
| vaccinationId de otra Pet | 404 |
| propiedad no declarada | 400 |

Debe existir al menos un test automatizado del flujo de autenticación.

---

# Fase 16 — Swagger / OpenAPI

Swagger forma parte del MVP.

La configuración base puede prepararse antes, pero aquí se realiza la revisión integral.

Rutas:

```text
/api/docs
/api/docs-json
```

Tags:

```text
health
auth
pets
pet-access
vaccinations
```

Documentar:

```text
DTOs
requests
responses
status HTTP
Bearer Auth
errores principales
```

## Definition of Done

```text
✅ Swagger abre
✅ todos los endpoints aparecen
✅ DTOs visibles
✅ Bearer Auth funciona
✅ responses principales documentadas
✅ Swagger coincide con la implementation
```

---

# Fase 17 — Postman

Crear la colección final cuando los endpoints estén estabilizados.

Environment:

```text
baseUrl
runId

ownerEmail
caregiverEmail
viewerEmail
outsiderEmail

ownerAccessToken
ownerRefreshToken
caregiverAccessToken
viewerAccessToken
outsiderAccessToken

petId
vaccinationId
sharedUserId
```

Happy path:

```text
Health
↓
register 4 users
↓
login 4 users
↓
OWNER create Pet
↓
OWNER add CAREGIVER
↓
OWNER add VIEWER
↓
CAREGIVER create Vaccination
↓
VIEWER read
↓
VIEWER write → 403
↓
OUTSIDER read → 403
↓
refresh
↓
logout
↓
reusar refresh → 401
```

Postman sirve como:

```text
demo
smoke test
QA manual reproducible
apoyo para el oral
```

No reemplaza tests automatizados.

---

# Fase 18 — README final

README debe incluir:

```text
nombre
descripción
objetivo
autora
stack
requisitos
instalación
variables de entorno
PostgreSQL
Prisma/migraciones
cómo ejecutar
modelo de datos
auth
roles
endpoints
Swagger
tests
Docker
deploy
documentación adicional
fuera de alcance
```

---

# Fase 19 — Docker de la API

Crear:

```text
Dockerfile
.dockerignore
```

Preferir multi-stage build.

Objetivo:

```text
dependencies
↓
build
↓
runtime
```

La imagen final debe:

- ejecutar solo lo necesario;
- no incluir `.env`;
- no contener secretos;
- evitar usuario root cuando sea razonable.

## Definition of Done

```text
✅ docker build
✅ docker run
✅ GET /api/v1/health → 200
```

---

# Fase 20 — Deploy

Deploy:

```text
NestJS API
+
PostgreSQL gestionado
```

Variables:

```text
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
JWT_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
CORS_ORIGIN
PORT
```

Producción:

```bash
prisma migrate deploy
```

Smoke test:

```text
GET health
↓
register
↓
login
↓
create pet
↓
add access
↓
create vaccination
↓
read
↓
refresh
↓
logout
```

Luego reiniciar el servicio y comprobar:

```text
datos siguen existiendo
```

## Definition of Done

```text
✅ API pública
✅ PostgreSQL producción
✅ migraciones aplicadas
✅ Swagger accesible
✅ smoke test completo
✅ persistencia después de reinicio
```

---

# Fase 21 — Preparación del oral

No agregar código nuevo.

Preparar una hoja de defensa técnica:

```text
Decisión
¿Por qué?
¿Qué problema resuelve?
¿Qué alternativa existía?
```

Preguntas prioritarias:

```text
¿Por qué PetAccess?
¿Por qué N:M?
¿Por qué no Pet.ownerId?
¿Por qué JWT?
¿Por qué access + refresh?
¿Por qué bcrypt?
¿Por qué guardar hash del refresh?
¿Por qué DTO si existe TypeScript?
¿Por qué Controller vs Service?
¿Por qué Guard?
¿Por qué transaction al crear Pet?
¿Por qué Serializable para último OWNER?
¿Por qué PATCH?
¿Por qué 401 vs 403?
¿Por qué UNIQUE(userId, petId)?
¿Por qué no User CRUD?
¿Por qué logout no invalida access inmediatamente?
¿Por qué Vaccination valida finalState en PATCH?
```

Las respuestas deben basarse en el código real del repositorio.

---

# Flujo de trabajo con Codex

Codex se usa como agente de implementación, no como responsable del producto.

No usar prompts como:

```text
“Hacé PetCare.”
```

Cada tarea debe contener:

```text
TASK
GOAL
SOURCE OF TRUTH
SCOPE
DO NOT
ACCEPTANCE CRITERIA
VALIDATION COMMANDS
REPORT
```

Ejemplo:

```text
TASK 001 — Bootstrap PetCare API

SOURCE OF TRUTH
- AGENTS.md
- docs/specification.md
- docs/implementation-plan.md

GOAL
Prepare the NestJS application foundation.

SCOPE
- ConfigModule
- /api/v1
- GET /health
- .env.example

DO NOT
- Prisma
- Auth
- Users
- Pets
- Vaccinations
- modify specification

ACCEPTANCE
- pnpm lint passes
- pnpm build passes
- GET /api/v1/health returns 200
- body equals {"status":"ok"}

REPORT
- files changed
- short explanation
- commands executed
```

Flujo:

```text
Specification
      ↓
Task pequeña
      ↓
Codex
      ↓
git diff
      ↓
entender cambios
      ↓
lint
      ↓
tests
      ↓
build
      ↓
prueba manual
      ↓
commit
```

---

# Tasks sugeridas para Codex

```text
TASK 001 → Bootstrap + Config + Health
TASK 002 → PostgreSQL Docker + Prisma setup
TASK 003 → schema.prisma + migration
TASK 004 → ValidationPipe + error contract
TASK 005 → UsersModule interno
TASK 006 → Register
TASK 007 → Login + JWT
TASK 008 → Guard + /auth/me
TASK 009 → Refresh + Logout
TASK 010 → Create Pet
TASK 011 → Pet CRUD
TASK 012 → PetAccess
TASK 013 → Create Vaccination
TASK 014 → Vaccination CRUD
TASK 015 → Security hardening
TASK 016 → critical tests
TASK 017 → Swagger review
TASK 018 → Postman
TASK 019 → Docker
TASK 020 → Deploy
```

---

# Orden general definitivo

```text
01 Bootstrap Nest
      ↓
02 PostgreSQL + Prisma
      ↓
03 Validation + errors
      ↓
04 Users internal
      ↓
05 Register
      ↓
06 Login
      ↓
07 JWT Guard
      ↓
08 Refresh + Logout
      ↓
   🚩 AUTH DONE
      ↓
09 Create Pet
      ↓
10 Pet CRUD
      ↓
11 PetAccess
      ↓
   🚩 AUTHORIZATION DONE
      ↓
12 Create Vaccination
      ↓
13 Vaccination CRUD
      ↓
   🚩 DOMAIN DONE
      ↓
14 Security
      ↓
15 Tests
      ↓
16 Swagger
      ↓
17 Postman
      ↓
18 README
      ↓
19 Docker
      ↓
20 Deploy
      ↓
21 Oral
```

---

# Niveles de avance

## 🟥 Foundation incompleta

```text
Nest
DB
Auth
```

Todavía no alcanza para entregar.

## 🟨 Core funcional

```text
+ Pet CRUD
+ Vaccination CRUD
+ PetAccess
+ autorización
```

Funciona, pero todavía falta calidad/entrega.

## 🟩 Integrador listo

```text
+ security
+ tests
+ Swagger
+ Postman
+ README
+ Docker
+ deploy
+ persistencia comprobada
+ commits claros
```

---

# Definition of Done final

PetCare V1 está terminado cuando:

```text
register
↓
login
↓
access JWT
↓
create Pet + OWNER atómico
↓
shared PetAccess
↓
OWNER / CAREGIVER / VIEWER respetan permisos
↓
Vaccination CRUD
↓
validaciones de fechas
↓
errores estables
↓
refresh
↓
logout
↓
security
↓
tests
↓
Swagger
↓
Postman
↓
Docker
↓
deploy
↓
persistencia
```

y cada decisión técnica puede explicarse sin responder:

> “porque Codex lo hizo así”.
