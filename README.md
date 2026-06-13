# Insomnia AI

Sistema de monitoreo y detección en tiempo real de somnolencia, fatiga y distracción mediante análisis facial. El procesamiento se realiza 100% en el cliente con **MediaPipe Face Mesh** para garantizar privacidad y velocidad, mientras que el backend en **FastAPI** gestiona persistencia, analíticas y alertas agregadas.

---

## Estructura del Proyecto

- **`/backend`**: API en FastAPI (Python), modelos SQLAlchemy (PostgreSQL), migraciones Alembic y esquemas Pydantic.
- **`/src`**: Frontend de la aplicación web estructurado en módulos JavaScript Vanilla, estilizado con CSS personalizado y empaquetado mediante Vite.

---

## Requisitos Previos

- **Python 3.10+**
- **Node.js 18+**
- Base de datos **PostgreSQL** activa.

---

## Configuración y Arranque del Backend

1. **Instalar dependencias**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Configurar variables de entorno**:
   Copia el archivo de ejemplo y configura tu string de conexión de base de datos y tu JWT secret:
   ```bash
   cp .env.example .env
   ```
   *Nota: `JWT_SECRET` es obligatorio. Si dejas el valor por defecto o uno inseguro, el backend generará advertencias de seguridad al arrancar.*

3. **Ejecutar migraciones de base de datos**:
   ```bash
   python -m alembic upgrade head
   ```

4. **Iniciar el servidor de desarrollo**:
   ```bash
   uvicorn app.main:app --reload
   ```
   La API estará disponible en `http://127.0.0.1:8000/` y la documentación interactiva Swagger en `http://127.0.0.1:8000/docs`.

---

## Configuración y Arranque del Frontend

1. **Instalar dependencias**:
   Desde la raíz del proyecto:
   ```bash
   npm install
   ```

2. **Configurar variables de entorno**:
   Copia el archivo de configuración para Vite:
   ```bash
   cp .env.example .env
   ```

3. **Iniciar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

---

## Características Implementadas

### Seguridad
- **Protección XSS**: Todos los inputs de usuario (nombre de usuario, nombres de grupos, códigos de acceso) se escapan usando funciones de sanitización antes de insertarse en el DOM.
- **Throttling y Rate Limiting**: Los endpoints de registro y login (`/api/auth/register` y `/api/auth/login`) están limitados a un máximo de 5 peticiones por minuto por dirección IP mediante `slowapi`.
- **CORS dinámico**: Configurable desde variables de entorno.
- **Sin Credenciales Expuestas**: `.env` ha sido retirado del control de versiones git.

### Base de Datos y Rendimiento
- **Migraciones con Alembic**: Manejo del ciclo de vida del esquema de base de datos Postgres de forma controlada.
- **Optimización de consultas**: Eliminación de consultas N+1 utilizando `joinedload` de SQLAlchemy para traer información de grupos y miembros en un solo query.

### Funcionalidades Corregidas
- **Detalle de trabajadores funcional**: El dashboard del supervisor ahora muestra de forma correcta las analíticas e historial de sesiones del trabajador seleccionado utilizando parámetros de consulta con validación de roles en el backend.
- **Abandono de grupos**: Los trabajadores ahora pueden salir voluntariamente de los grupos a los que pertenecen sin recibir errores de autorización (403).
- **Nombre de grupo al unirse**: Se muestra de manera correcta el nombre del grupo al que se acaba de unir el usuario, en lugar de indicar `"undefined"`.
- **Correcciones visuales**: Se eliminó un carácter extra residual (`}`) en los distintivos de protección de administración.
