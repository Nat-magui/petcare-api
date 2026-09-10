<div align="center">

# PetCare API V1

**API REST para la gestión colaborativa de mascotas, accesos compartidos y registros de vacunación.**

Backend del proyecto académico **IntegrarTEC — Integrador 4**. Este repositorio contiene exclusivamente la API; no incluye frontend ni aplicación móvil.

![NestJS 11](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Prisma 7](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-package_manager-F69220?logo=pnpm&logoColor=white)

![Unit tests](https://img.shields.io/badge/unit-80%20passing-2EA44F?logo=vitest&logoColor=white)
![E2E tests](https://img.shields.io/badge/e2e-177%20passing-2EA44F?logo=vitest&logoColor=white)
![Postman snapshot](https://img.shields.io/badge/Postman-85%2F85%20passing-FF6C37?logo=postman&logoColor=white)

</div>

> Los badges de pruebas representan la instantánea local verificada del proyecto, no métricas de integración continua.

## Navegación

- [Proyecto](#proyecto)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura y dominio](#arquitectura-y-dominio)
- [Roles y permisos](#roles-y-permisos)
- [Reproducir localmente](#-reproducir-petcare-localmente)
- [Swagger / OpenAPI](#swagger--openapi)
- [Postman](#-reproducir-el-flujo-completo-con-postman)
- [Pruebas y calidad](#pruebas-automatizadas-y-calidad)
- [Documentación](#documentación-del-proyecto)
- [Solución de problemas](#solución-de-problemas)
- [Checklist](#checklist-de-reproducción-local)
- [Despliegue](#despliegue)

## Proyecto

PetCare centraliza información básica de mascotas cuando su cuidado se comparte entre familiares, cuidadores o personas vinculadas a una organización de rescate. La API permite registrar usuarios, autenticar sesiones, gestionar mascotas, compartir acceso por rol y mantener registros declarativos de vacunación.

El dominio V1 está congelado en cuatro recursos:

- `User`: cuenta interna de acceso; no existe un CRUD público de usuarios.
- `Pet`: primer recurso CRUD académico.
- `PetAccess`: relación explícita entre usuarios y mascotas, con el rol que determina la autorización.
- `Vaccination`: segundo recurso CRUD académico.

La V1 no incluye frontend, pagos, integraciones externas, invitaciones, recomendaciones clínicas ni lógica para calcular próximas dosis. Para compartir una mascota, la cuenta destino debe existir previamente.

## Stack tecnológico

![Node.js](https://img.shields.io/badge/Node.js-runtime-5FA04E?logo=nodedotjs&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-access%20%2B%20refresh-000000?logo=jsonwebtokens&logoColor=white)
![bcrypt 6](https://img.shields.io/badge/bcrypt-6-3385FF)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Swagger](https://img.shields.io/badge/Swagger-OpenAPI-85EA2D?logo=swagger&logoColor=black)
![Postman](https://img.shields.io/badge/Postman-collection-FF6C37?logo=postman&logoColor=white)
![Vitest 4](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)

| Tecnología | Versión verificada | Propósito en PetCare |
|---|---:|---|
| NestJS | 11 | Estructura modular, controladores, servicios, guards, pipes y filtros HTTP. |
| TypeScript | 6 | Tipado estático y compilación del backend ESM. |
| Node.js | No fijada por el repositorio | Runtime compatible con NestJS 11; el proyecto no impone una versión exacta. |
| PostgreSQL | 17 | Persistencia relacional local provista por Docker Compose. |
| Prisma | 7.10.0 | Esquema, migraciones y acceso tipado a PostgreSQL. |
| JWT + bcrypt | JWT / bcrypt 6.0.0 | Tokens de acceso y refresh; hashing de contraseñas y refresh tokens. |
| Swagger / OpenAPI | `@nestjs/swagger` 11.4.7 | Contrato HTTP explorable y prueba manual de endpoints. |
| Vitest | 4 | Pruebas unitarias, E2E y cobertura. |
| Postman | Colección v2.1 | Demostración y verificación reproducible de flujos completos. |
| pnpm | No fijada por el repositorio | Instalación de dependencias y ejecución de scripts. |

## Arquitectura y dominio

La aplicación mantiene la separación de responsabilidades de NestJS:

```text
HTTP Request → Controller → Service → PrismaService → PostgreSQL
```

- `auth`: registro, login, identificación del usuario, refresh y logout.
- `users`: capa interna que Auth y PetAccess reutilizan; no expone un CRUD público.
- `pets`: reglas y operaciones sobre mascotas.
- `pet-access`: acceso compartido, roles y protección del último OWNER.
- `vaccinations`: registros de vacunación y validación de fechas.
- `prisma`: persistencia y transacciones contra PostgreSQL.
- `common` y `config`: validación global, errores, seguridad y Swagger.

La relación `User ↔ Pet` es muchos-a-muchos y se materializa mediante `PetAccess`. No existe `Pet.ownerId`: el ownership y los permisos provienen de `PetAccess.role`.

```text
User 1 ─── N PetAccess N ─── 1 Pet 1 ─── N Vaccination
```

La creación de una mascota y el `PetAccess` `OWNER` de quien la crea forman una operación atómica. Al eliminar una mascota, las relaciones `PetAccess` y `Vaccination` dependientes se eliminan por cascada.

El contrato funcional completo está en el [Documento 01 — Especificación Funcional de la API](docs/01_Especificacion_Funcional_API_PetCare_v1_2.pdf).

### Superficie HTTP

Todas las rutas de negocio usan el prefijo `/api/v1`.

| Grupo | Ruta base | Función |
|---|---|---|
| Health | `/api/v1/health` | Disponibilidad de la API. |
| Auth | `/api/v1/auth` | Registro, login, usuario actual, refresh y logout. |
| Pets | `/api/v1/pets` | CRUD de mascotas accesibles para el usuario. |
| PetAccess | `/api/v1/pets/:petId/access` | Gestión de usuarios y roles de una mascota. |
| Vaccinations | `/api/v1/pets/:petId/vaccinations` | CRUD de vacunaciones asociado a una mascota. |

## Roles y permisos

Los roles son específicos para cada mascota: un mismo usuario puede ser `OWNER` de una y `VIEWER` de otra.

| Operación | OWNER | CAREGIVER | VIEWER | Sin PetAccess |
|---|:---:|:---:|:---:|:---:|
| Leer Pet | ✅ | ✅ | ✅ | ❌ |
| Actualizar Pet | ✅ | ✅ | ❌ | ❌ |
| Eliminar Pet | ✅ | ❌ | ❌ | ❌ |
| Gestionar PetAccess | ✅ | ❌ | ❌ | ❌ |
| Leer Vaccination | ✅ | ✅ | ✅ | ❌ |
| Crear, actualizar o eliminar Vaccination | ✅ | ✅ | ❌ | ❌ |

Toda mascota existente debe conservar al menos un `OWNER`. Quitar o degradar al último `OWNER` produce `409 PET_LAST_OWNER`; todos los `OWNER` tienen la misma autoridad y no existe `PRIMARY_OWNER` en V1.

Las reglas y códigos controlados se detallan en el [Documento 02 — Diccionario de Errores y Reglas de Negocio](docs/02_Diccionario_Errores_Reglas_Negocio_PetCare_v1_1.pdf).

## Requisitos previos

- Git.
- Node.js compatible con NestJS 11. El repositorio no fija una versión exacta de Node.js.
- pnpm.
- Docker Desktop, o Docker Engine con Docker Compose.

No es necesario instalar PostgreSQL de forma nativa: `compose.yaml` proporciona la instancia local.

## 🚀 Reproducir PetCare localmente

### 1. Clonar el repositorio

```bash
git clone https://github.com/Nat-magui/petcare-api.git
cd petcare-api
```

### 2. Crear el entorno local

PowerShell:

```powershell
Copy-Item .env.example .env
```

Unix / macOS:

```bash
cp .env.example .env
```

La configuración de ejemplo coincide con PostgreSQL de `compose.yaml`. Los valores `change-me-*` sirven únicamente para desarrollo local: reemplazá ambos secretos JWT por valores fuertes y distintos fuera de un entorno local.

> El archivo `.env` se crea antes de instalar porque el script `postinstall` ejecuta `prisma generate` y la configuración de Prisma lee `DATABASE_URL`.

| Variable | Función | Valor local de `.env.example` |
|---|---|---|
| `PORT` | Puerto HTTP de la API. | `3000` |
| `DATABASE_URL` | Conexión PostgreSQL utilizada por Prisma. | `postgresql://petcare:petcare_password@localhost:5432/petcare?schema=public` |
| `JWT_SECRET` | Firma de access JWT. | Placeholder local; cambiar fuera de desarrollo. |
| `JWT_REFRESH_SECRET` | Firma de refresh JWT. | Placeholder local; cambiar fuera de desarrollo. |
| `JWT_EXPIRES_IN` | Duración del access token. | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token. | `7d` |
| `CORS_ORIGIN` | Origen permitido por CORS. | `http://localhost:3000` |
| `THROTTLE_TTL_MS` | Ventana del rate limit global, en milisegundos. | `60000` |
| `THROTTLE_LIMIT` | Máximo global por ventana. | `100` |
| `AUTH_THROTTLE_TTL_MS` | Ventana reforzada para register/login. | `60000` |
| `AUTH_THROTTLE_LIMIT` | Máximo reforzado para register/login. | `10` |

### 3. Instalar dependencias

```bash
pnpm install
```

`postinstall` ejecuta automáticamente `prisma generate`; no hace falta repetirlo en una instalación normal.

### 4. Iniciar PostgreSQL

```bash
docker compose up -d
docker compose ps
```

La configuración verificada levanta PostgreSQL 17 en el contenedor `petcare-postgres`, publica `localhost:5432` y crea la base `petcare`. En `docker compose ps`, esperá a que el servicio figure como saludable antes de migrar.

### 5. Aplicar las migraciones existentes

```bash
pnpm exec prisma migrate deploy
```

Este comando aplica las migraciones versionadas de `prisma/migrations/` sin crear una migración nueva. Prisma Client ya fue generado por `postinstall`.

### 6. Iniciar la API

Desarrollo con recarga automática:

```bash
pnpm start:dev
```

También están disponibles los scripts verificados:

```bash
pnpm start
pnpm build
pnpm start:prod
```

`pnpm start:prod` requiere que `pnpm build` haya generado previamente la salida de `dist/`.

### 7. Verificar disponibilidad

```http
GET http://localhost:3000/api/v1/health
```

Respuesta esperada: `HTTP 200`.

```json
{
  "status": "ok"
}
```

El health check confirma que la API responde; no valida por sí solo los flujos de autenticación, autorización o persistencia.

## Swagger / OpenAPI

Con la API iniciada:

- Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- OpenAPI JSON: [http://localhost:3000/api/docs-json](http://localhost:3000/api/docs-json)

Flujo recomendado para probar rutas protegidas:

1. Abrí Swagger UI.
2. Ejecutá `POST /api/v1/auth/register` y luego `POST /api/v1/auth/login`.
3. Copiá únicamente el `accessToken` de la respuesta.
4. Elegí **Authorize**, pegá el token y confirmá la autenticación Bearer.
5. Probá los endpoints protegidos según el rol del usuario.

Swagger agrupa el contrato en `health`, `auth`, `pets`, `pet-access` y `vaccinations`. No uses tokens reales en documentación, capturas ni commits. El detalle contractual permanece en el [Documento 01](docs/01_Especificacion_Funcional_API_PetCare_v1_2.pdf).

## 📬 Reproducir el flujo completo con Postman

Archivos versionados:

- [`postman/PetCare_API_V1.postman_collection.json`](postman/PetCare_API_V1.postman_collection.json)
- [`postman/PetCare_Local.postman_environment.json`](postman/PetCare_Local.postman_environment.json)

1. Abrí Postman e importá ambos archivos JSON.
2. Seleccioná el environment **PetCare Local**.
3. Confirmá que `baseUrl` sea `http://localhost:3000/api/v1`.
4. Abrí Collection Runner para la colección **PetCare API V1**.
5. Ejecutá la colección completa con **1 iteration**.

La primera solicitud de setup crea un `runId` único. A partir de él, la colección genera emails y guarda automáticamente tokens e identificadores en variables runtime del environment. No es necesario copiar manualmente `petId`, `vaccinationId` ni IDs de usuarios.

El recorrido crea cuatro cuentas con propósitos diferentes:

| Usuario de prueba | Rol en el flujo |
|---|---|
| OWNER | Crea la mascota y administra accesos. |
| CAREGIVER | Mantiene la mascota y sus vacunaciones. |
| VIEWER | Verifica las operaciones de solo lectura. |
| OUTSIDER | Usuario autenticado sin `PetAccess`, usado para verificar denegaciones. |

Los escenarios negativos esperan deliberadamente respuestas `400`, `401`, `403`, `404` o `409`; una respuesta de error esperada también constituye una prueba exitosa. La instantánea local verificada es **85/85 tests de Postman passing**.

La colección funciona como demo, smoke test y flujo de QA repetible, pero no reemplaza las pruebas automatizadas. Su diseño y trazabilidad se explican en el [Documento 03 — Diagramas de Flujo y Casos de Uso](docs/03_Diagramas_Flujo_Casos_Uso_PetCare_v1_1.pdf).

## Flujo funcional sugerido

```text
Health
  → Registrar OWNER, CAREGIVER, VIEWER y OUTSIDER
  → Login
  → Crear Pet
  → Compartir mediante PetAccess
  → Verificar autorización por rol
  → Crear, leer y actualizar Vaccination
  → Refresh
  → Logout
  → Verificar errores contractuales
```

Postman automatiza este recorrido; la secuencia sirve también como guía para una demostración manual en Swagger.

## Pruebas automatizadas y calidad

| Capa | Comando | Instantánea verificada |
|---|---|---:|
| Unitarias | `pnpm test` | 11 archivos, 80 tests passing |
| E2E | `pnpm test:e2e` | 12 archivos, 177 tests passing |
| Postman Runner | Colección completa, 1 iteración | 85/85 tests passing |

Las pruebas unitarias verifican servicios, guards, validación y errores de forma aislada. Las E2E recorren el contrato HTTP con PostgreSQL. Postman conserva una demostración secuencial independiente; sus aserciones no se suman a las de Vitest como si fueran una única capa.

Comandos disponibles en `package.json`:

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm test:cov
```

El proyecto no declara cobertura del 100 % ni publica métricas de CI.

## Contrato de errores

Los errores controlados mantienen una estructura estable:

```json
{
  "statusCode": 409,
  "code": "PET_LAST_OWNER",
  "error": "Conflict",
  "message": "La mascota debe conservar al menos un OWNER."
}
```

`details` es opcional y se utiliza principalmente para validaciones de campos o reglas de negocio. Los clientes deben decidir su comportamiento mediante `code`, no comparando el texto literal de `message`.

Consultá el catálogo y el orden conceptual de evaluación en el [Documento 02](docs/02_Diccionario_Errores_Reglas_Negocio_PetCare_v1_1.pdf).

## Seguridad

- Las contraseñas se hashean con bcrypt y nunca se exponen.
- Se emiten access JWT y refresh JWT con secretos independientes.
- Solo se persiste el hash del refresh token.
- Un guard global protege las rutas que no están marcadas explícitamente como públicas.
- Helmet agrega cabeceras HTTP de seguridad.
- CORS permite únicamente el origen configurado, además de solicitudes sin header `Origin`.
- El `ValidationPipe` global usa `whitelist`, `forbidNonWhitelisted` y `transform`.
- Existe rate limiting global y un límite reforzado para registro y login.
- Los errores inesperados devuelven una respuesta `500 INTERNAL_ERROR` genérica; en producción no se registran stack traces.

PetCare V1 mantiene una única sesión refresh vigente por usuario. Cada login reemplaza el hash almacenado; `/auth/refresh` emite un access token sin rotar el refresh token; `/auth/logout` invalida el refresh al limpiar su hash. Un access JWT ya emitido es stateless y puede seguir vigente hasta su expiración.

Las reglas de seguridad y negocio completas permanecen en el [Documento 02](docs/02_Diccionario_Errores_Reglas_Negocio_PetCare_v1_1.pdf).

## Estructura del repositorio

```text
petcare-api/
├── src/
│   ├── auth/
│   ├── common/
│   ├── config/
│   ├── health/
│   ├── pet-access/
│   ├── pets/
│   ├── prisma/
│   ├── users/
│   └── vaccinations/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── test/
├── postman/
├── docs/
├── compose.yaml
├── prisma.config.ts
├── .env.example
├── package.json
└── README.md
```

## Documentación del proyecto

| Documento | Propósito | Link |
|---|---|---|
| Documento 01 — Especificación Funcional de la API | Contrato HTTP, recursos, DTOs, endpoints y criterios de aceptación. | [Abrir PDF](docs/01_Especificacion_Funcional_API_PetCare_v1_2.pdf) |
| Documento 02 — Diccionario de Errores y Reglas de Negocio | Códigos, reglas `BR-*`, permisos y trazabilidad de errores. | [Abrir PDF](docs/02_Diccionario_Errores_Reglas_Negocio_PetCare_v1_1.pdf) |
| Documento 03 — Diagramas de Flujo y Casos de Uso | Flujos operativos, casos de uso y blueprint de verificación. | [Abrir PDF](docs/03_Diagramas_Flujo_Casos_Uso_PetCare_v1_1.pdf) |
| Specification operativa | Resumen ejecutable del alcance y comportamiento V1 congelado. | [Abrir Markdown](docs/specification.md) |
| Plan de implementación | Fases, checkpoints y Definition of Done del proyecto. | [Abrir Markdown](docs/implementation-plan.md) |

## Solución de problemas

### PostgreSQL rechaza la conexión

Comprobá que el servicio esté iniciado y saludable:

```bash
docker compose up -d
docker compose ps
```

Verificá también que `DATABASE_URL` coincida con usuario, contraseña, host, puerto y base definidos en `compose.yaml`.

### El puerto 5432 está ocupado

Otro PostgreSQL o servicio local puede estar usando el puerto. Detené intencionalmente el servicio en conflicto o cambiá el puerto publicado en `compose.yaml` y el puerto de `DATABASE_URL` para que coincidan. No elimines volúmenes para resolver un conflicto de puerto.

### El puerto 3000 está ocupado

Cambiá `PORT` en `.env`. Después actualizá las URLs locales y `baseUrl` en el environment de Postman para usar el mismo puerto.

### Prisma Client no está generado o quedó desactualizado

```bash
pnpm exec prisma generate
```

Durante una instalación normal, `pnpm install` ya ejecuta `prisma generate` mediante el script `postinstall`.

### Las migraciones no están aplicadas

Con PostgreSQL saludable y `DATABASE_URL` configurada:

```bash
pnpm exec prisma migrate deploy
```

### Un access token expiró en una solicitud individual de Postman

Volvé a ejecutar la solicitud **Login** correspondiente al usuario. Una ejecución completa mediante Collection Runner genera credenciales nuevas automáticamente.

## Checklist de reproducción local

- [ ] Dependencias instaladas con pnpm.
- [ ] `.env` creado desde `.env.example`.
- [ ] PostgreSQL figura saludable en `docker compose ps`.
- [ ] Migraciones versionadas aplicadas.
- [ ] La API inicia sin errores.
- [ ] `GET /api/v1/health` devuelve `200` y `{ "status": "ok" }`.
- [ ] Swagger UI abre en `/api/docs`.
- [ ] La colección y el environment de Postman se importan correctamente.
- [ ] La colección completa de Postman finaliza correctamente.
- [ ] `pnpm lint` pasa.
- [ ] `pnpm build` pasa.
- [ ] `pnpm test` pasa.
- [ ] `pnpm test:e2e` pasa.

## 🚀 Despliegue

PetCare API V1 se encuentra desplegada en **Render**, utilizando un **Web Service Node.js** para la API y una instancia administrada de **PostgreSQL 17** para persistencia.

### Producción

- 🌐 **API:** https://petcare-api-3i5v.onrender.com
- 📘 **Swagger / OpenAPI:** https://petcare-api-3i5v.onrender.com/api/docs
- ❤️ **Health check:** https://petcare-api-3i5v.onrender.com/api/v1/health

La API y la base de datos PostgreSQL se encuentran desplegadas en la misma región de Render (**Virginia — US East**) y la aplicación se conecta a PostgreSQL mediante la red privada del proveedor.

Las migraciones versionadas de Prisma fueron aplicadas en producción mediante:

```bash
pnpm exec prisma migrate deploy
```

El entorno productivo fue verificado mediante:

* `GET /api/v1/health` → `200 OK`.
* Swagger UI accesible públicamente.
* Esquema de Prisma actualizado en PostgreSQL.
* Collection Runner de Postman ejecutado contra producción → **85/85 tests passing**.
- Persistencia verificada después de reiniciar el Web Service de Render.

> **Nota sobre Render Free:** el Web Service puede entrar en suspensión después de un período de inactividad. La primera solicitud puede demorar mientras el servicio vuelve a iniciarse.

> La base PostgreSQL utilizada para esta entrega corresponde al plan gratuito de Render y tiene una duración limitada. Está destinada a la demostración académica del proyecto.

## 🎓 Nota académica y licencia

PetCare API V1 es un proyecto académico de **IntegrarTEC — Integrador 4**.

**Autora:** Magalí Aldana Suárez

`package.json` declara el proyecto como `private` y `UNLICENSED`; este repositorio no concede una licencia MIT ni otra licencia de distribución.
