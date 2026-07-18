# Task Attachments via admin/ Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task attachments (add via button, drag-drop, or Ctrl+V paste; 8MB max; many per task) with file bytes stored on the `admin/` CI4 backend instead of Supabase Storage, to avoid Supabase storage/egress cost.

**Architecture:** Browser never talks to `admin/` directly. `admin/` exposes a small server-to-server API (`api/pm/attachments`, gated by a shared-secret `X-Pm-Key` header) for storing/serving/deleting files. The PM tool's Next.js server (a Server Action for upload/delete, one Route Handler for download) is the only thing that holds the shared secret; it authorizes every request against Supabase RLS on the existing `public.attachments` table before touching `admin/`, then relays bytes.

**Tech Stack:** CodeIgniter 4 (PHP) for `admin/`; Next.js 16 App Router + Supabase (`@supabase/ssr`) + `react-dropzone` (already a dependency, unused until now) for `project-management/`.

## Global Constraints

- Do **not** run `git commit` at the end of any task — the user commits manually.
- 8MB max per file (`MAX_BYTES = 8_388_608`), enforced server-side in `admin/` (source of truth) and client-side in the PM tool (UX only).
- No new Supabase migration — `public.attachments.storage_path` (already `text`, already RLS-gated, see `project-management/supabase/migrations/0005_collaboration.sql:29-40`) just points at an `admin/`-relative path instead of a Supabase Storage object key.
- `PM_SERVICE_KEY` is a server-only secret — never prefix it `NEXT_PUBLIC_`, never send it to the browser.
- Hard-delete file bytes immediately on removal (`unlink()`); the `admin/` metadata row keeps a `deleted_at` timestamp as a light audit trail.
- Allowed attachment types: images (jpg/jpeg/png/webp/gif), office docs (pdf/doc/docx/xls/xlsx/ppt/pptx), text/csv, zip — enforced by ext **and** MIME whitelist in `admin/`.

## Discovery note (read before starting)

`project-management/src/components/task-panel.tsx` **already has a working attachments feature** — upload/list/download/delete wired to Supabase Storage directly (`handleUpload`, `handleDownload`, and the attachments list block, plus `addAttachmentRecord`/`deleteAttachment` in `actions.ts`). This plan **migrates** that existing feature to `admin/` storage and **adds** the two attach paths it doesn't have yet (drag-and-drop, paste) — it is not a greenfield build. Read the "Files: Modify" sections carefully; they replace specific existing blocks, not the whole file.

---

## Task 1: `pm_attachments` table + model (admin/)

**Files:**
- Create: `admin/app/Database/Migrations/2026-07-18-120000_CreatePmAttachmentsTable.php`
- Create: `admin/app/Models/PmAttachmentsModel.php`

**Interfaces:**
- Produces: `PmAttachmentsModel` — CI4 `Model` over table `pm_attachments`, `returnType='array'`, `useAutoIncrement=false` (primary key is the UUID the PM tool generates), fields `id, storage_path, original_name, mime_type, size_bytes, created_at, deleted_at`. Consumed by Task 3's controller.

- [ ] **Step 1: Write the migration**

```php
<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * File-metadata store for task attachments uploaded by the project-management
 * Next.js app. id matches the id of the corresponding row in that app's
 * Supabase `attachments` table — admin stays blind to "tasks"/"projects".
 */
class CreatePmAttachmentsTable extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'       => 'CHAR',
                'constraint' => 36,
            ],
            'storage_path' => [
                'type'       => 'VARCHAR',
                'constraint' => 500,
            ],
            'original_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 255,
            ],
            'mime_type' => [
                'type'       => 'VARCHAR',
                'constraint' => 127,
                'null'       => true,
            ],
            'size_bytes' => [
                'type'     => 'BIGINT',
                'unsigned' => true,
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'deleted_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->createTable('pm_attachments');
    }

    public function down()
    {
        $this->forge->dropTable('pm_attachments');
    }
}
```

- [ ] **Step 2: Run the migration**

Run (from `admin/`): `php spark migrate`
Expected: `Migrations complete.` and `php spark migrate:status` lists `CreatePmAttachmentsTable` as applied.

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use CodeIgniter\Model;

class PmAttachmentsModel extends Model
{
    protected $table            = 'pm_attachments';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = false; // primary key is a caller-supplied UUID
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false; // deleted_at is set manually, row is kept as an audit trail
    protected $protectFields    = true;
    protected $useTimestamps    = false; // created_at is set explicitly on insert; no updated_at column
    protected $allowedFields    = [
        'id',
        'storage_path',
        'original_name',
        'mime_type',
        'size_bytes',
        'created_at',
        'deleted_at',
    ];
}
```

No automated test for this task — it's plain schema/CRUD scaffolding with no branching logic to exercise. It's verified indirectly by Task 3's feature test (which inserts/reads/deletes real rows through the full controller stack).

---

## Task 2: `PmKeyFilter` — shared-secret auth (admin/)

**Files:**
- Create: `admin/app/Filters/PmKeyFilter.php`
- Modify: `admin/app/Config/Filters.php`
- Modify: `admin/.env.example`

**Interfaces:**
- Produces: filter alias `pmkey`, checked against `env('pm.serviceKey')`. Consumed by Task 3's route group (`'filter' => 'pmkey'`).

- [ ] **Step 1: Write the filter**

```php
<?php

namespace App\Filters;

use App\Libraries\Common\JSONResponder;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Gates the PM-tool attachment API (X-Pm-Key header, single shared secret).
 * There is exactly one caller — the project-management Next.js server — so
 * unlike ScanKeyFilter this has no per-caller key table.
 */
class PmKeyFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        if (strtolower($request->getMethod()) === 'options') {
            return;
        }

        $responder = new JSONResponder();
        $provided  = trim($request->getHeaderLine('X-Pm-Key'));
        $expected  = (string) env('pm.serviceKey', '');

        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return $responder->forbidden();
        }
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        // no-op
    }
}
```

- [ ] **Step 2: Register the `pmkey` alias**

In `admin/app/Config/Filters.php`, add the import next to the other filter imports:

```php
use App\Filters\PmKeyFilter;
```

And add the alias entry to `$aliases` (next to `'scankey' => ScanKeyFilter::class,`):

```php
        'pmkey'         => PmKeyFilter::class,
```

- [ ] **Step 3: Add the config key to `.env.example`**

Append to `admin/.env.example` (matches the feature-grouped convention used by `scan.*`/`gemini.*`):

```
#--------------------------------------------------------------------
# PM TOOL — task attachments (server-to-server integration, no browser CORS)
#--------------------------------------------------------------------
# Shared secret the project-management Next.js server sends as X-Pm-Key.
# Generate with: openssl rand -hex 32
pm.serviceKey = ''
```

- [ ] **Step 4: Set a real secret in `admin/.env`**

Run: `openssl rand -hex 32`
Copy the output into `admin/.env` as `pm.serviceKey = '<generated value>'`. Save this same value — it's needed again in Task 4 for the PM tool's `.env.local`.

No automated test in this task — the filter's behavior is exercised end-to-end by Task 3's feature test (which needs a real route to hit).

---

## Task 3: `PmAttachmentController` + routes + feature test (admin/)

**Files:**
- Create: `admin/app/Controllers/API/PmAttachmentController.php`
- Create: `admin/app/Routes/API/PmAttachmentRoutes.php`
- Modify: `admin/app/Config/Routing.php`
- Create: `admin/tests/Feature/PmAttachmentApiTest.php`

**Interfaces:**
- Consumes: `PmAttachmentsModel` (Task 1), `pmkey` filter (Task 2), `App\Controllers\API\BaseController` (existing — provides `$this->responder`, a `JSONResponder`).
- Produces: `POST api/pm/attachments` → `{status, timestamp, data: {storage_path, size_bytes, mime_type}}`; `GET api/pm/attachments/{id}` → raw file bytes; `DELETE api/pm/attachments/{id}` → `{status, timestamp}`. Consumed by the PM tool's Task 5 (Server Action) and Task 6 (Route Handler).

- [ ] **Step 1: Write the failing test**

This is the first test file in `admin/` — creates the `tests/Feature/` directory.

```php
<?php

namespace Tests\Feature;

use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\FeatureTestTrait;

/**
 * @internal
 */
final class PmAttachmentApiTest extends CIUnitTestCase
{
    use FeatureTestTrait;

    protected function setUp(): void
    {
        parent::setUp();
        putenv('pm.serviceKey=test-secret-key');
        $_ENV['pm.serviceKey']    = 'test-secret-key';
        $_SERVER['pm.serviceKey'] = 'test-secret-key';
    }

    public function testMissingKeyIsForbidden(): void
    {
        $result = $this->post('api/pm/attachments');
        $result->assertStatus(403);
    }

    public function testWrongKeyIsForbidden(): void
    {
        $result = $this->withHeaders(['X-Pm-Key' => 'wrong-key'])->post('api/pm/attachments');
        $result->assertStatus(403);
    }

    public function testCorrectKeyPassesFilterButRejectsMissingFile(): void
    {
        $result = $this->withHeaders(['X-Pm-Key' => 'test-secret-key'])->post('api/pm/attachments');
        // Filter passes (no longer 403); controller then rejects for lack of a file.
        $result->assertStatus(400);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `admin/`): `composer test -- --filter PmAttachmentApiTest`
Expected: FAIL — route `api/pm/attachments` doesn't exist yet (404, not the expected 403/400).

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Controllers\API;

use App\Controllers\API\BaseController;
use App\Models\PmAttachmentsModel;
use CodeIgniter\HTTP\Files\UploadedFile;

class PmAttachmentController extends BaseController
{
    private const ALLOWED_EXT = [
        'jpg', 'jpeg', 'png', 'webp', 'gif',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'zip',
    ];

    private const ALLOWED_MIME = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/x-zip-compressed',
    ];

    private const MAX_BYTES = 8_388_608; // 8 MB

    public function store()
    {
        $id = trim((string) $this->request->getPost('id'));
        if ($id === '' || ! preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            return $this->responder->invalidInput('invalid_input', ['message' => 'A valid attachment id is required.']);
        }

        $file = $this->request->getFile('file');
        if (! $file instanceof UploadedFile || ! $file->isValid() || $file->hasMoved()) {
            return $this->responder->invalidInput('invalid_input', ['message' => 'No valid file uploaded.']);
        }
        if ($file->getSize() > self::MAX_BYTES) {
            return $this->responder->invalidInput('invalid_input', ['message' => 'File exceeds the 8MB limit.']);
        }

        $ext  = strtolower((string) $file->getClientExtension());
        $mime = (string) $file->getMimeType();
        if (! in_array($ext, self::ALLOWED_EXT, true) || ! in_array($mime, self::ALLOWED_MIME, true)) {
            return $this->responder->invalidInput('invalid_input', ['message' => 'File type not allowed.']);
        }

        $dir = WRITEPATH . 'uploads/pm_attachments/' . $id;
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $filename = bin2hex(random_bytes(8)) . '.' . $ext;
        if (! $file->move($dir, $filename)) {
            return $this->responder->internalError('internal_error', ['message' => 'Could not store the file.']);
        }

        $storagePath  = 'pm_attachments/' . $id . '/' . $filename; // relative to WRITEPATH/uploads
        $originalName = trim((string) $this->request->getPost('original_name')) ?: $file->getClientName();

        $attachments = new PmAttachmentsModel();
        $attachments->insert([
            'id'            => $id,
            'storage_path'  => $storagePath,
            'original_name' => $originalName,
            'mime_type'     => $mime,
            'size_bytes'    => $file->getSize(),
            'created_at'    => date('Y-m-d H:i:s'),
        ]);

        return $this->responder->success('uploaded', [
            'storage_path' => $storagePath,
            'size_bytes'   => $file->getSize(),
            'mime_type'    => $mime,
        ]);
    }

    public function show(string $id)
    {
        $attachments = new PmAttachmentsModel();
        $row = $attachments->find($id);
        if (! $row || $row['deleted_at'] !== null) {
            return $this->responder->notFound();
        }

        $path = WRITEPATH . 'uploads/' . $row['storage_path'];
        if (! is_file($path)) {
            return $this->responder->notFound();
        }

        return $this->response
            ->setHeader('Content-Type', $row['mime_type'] ?: 'application/octet-stream')
            ->setHeader('Content-Disposition', 'attachment; filename="' . addslashes($row['original_name']) . '"')
            ->setHeader('Content-Length', (string) filesize($path))
            ->setBody(file_get_contents($path));
    }

    public function delete(string $id)
    {
        $attachments = new PmAttachmentsModel();
        $row = $attachments->find($id);
        if (! $row) {
            return $this->responder->notFound();
        }

        $path = WRITEPATH . 'uploads/' . $row['storage_path'];
        if (is_file($path)) {
            unlink($path);
        }

        $attachments->update($id, ['deleted_at' => date('Y-m-d H:i:s')]);

        return $this->responder->success('deleted');
    }
}
```

- [ ] **Step 4: Write the routes and register them**

Create `admin/app/Routes/API/PmAttachmentRoutes.php`:

```php
<?php

/** @var \CodeIgniter\Router\RouteCollection $routes */

// Endpoints the project-management Next.js server calls to store/serve/delete
// task attachments. Authenticated by the X-Pm-Key header (pmkey filter),
// server-to-server only — the browser never calls these directly, so no CORS
// handling is needed here (CORS is a browser-enforced mechanism).
$routes->group('api/pm', ['namespace' => 'App\Controllers\API', 'filter' => 'pmkey'], function ($routes) {
    $routes->post('attachments', 'PmAttachmentController::store', ['as' => 'api-pm-attachments-store']);
    $routes->get('attachments/(:segment)', 'PmAttachmentController::show/$1', ['as' => 'api-pm-attachments-show']);
    $routes->delete('attachments/(:segment)', 'PmAttachmentController::delete/$1', ['as' => 'api-pm-attachments-delete']);
});
```

In `admin/app/Config/Routing.php`, add to the `$routeFiles` array (after the `ScanBridgeRoutes.php` line):

```php
        APPPATH . 'Routes/API/ScanBridgeRoutes.php',
        APPPATH . 'Routes/API/PmAttachmentRoutes.php',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `composer test -- --filter PmAttachmentApiTest`
Expected: PASS (3 tests, 3 assertions).

- [ ] **Step 6: Manual end-to-end smoke test**

With the admin app running (`php spark serve` or the XAMPP vhost) and `pm.serviceKey` set in `.env`:

```bash
# Upload
curl -s -X POST http://localhost:8080/api/pm/attachments \
  -H "X-Pm-Key: <your pm.serviceKey value>" \
  -F "id=11111111-1111-4111-8111-111111111111" \
  -F "original_name=test.png" \
  -F "file=@/path/to/a/small.png"
# Expected: {"status":"uploaded","timestamp":...,"data":{"storage_path":"pm_attachments/1111.../<hex>.png","size_bytes":...,"mime_type":"image/png"}}

# Download
curl -s -o /tmp/downloaded.png -D - http://localhost:8080/api/pm/attachments/11111111-1111-4111-8111-111111111111 \
  -H "X-Pm-Key: <your pm.serviceKey value>"
# Expected: 200, Content-Disposition: attachment; filename="test.png", downloaded.png matches the original bytes

# Delete
curl -s -X DELETE http://localhost:8080/api/pm/attachments/11111111-1111-4111-8111-111111111111 \
  -H "X-Pm-Key: <your pm.serviceKey value>"
# Expected: {"status":"deleted",...}; the file under admin/writable/uploads/pm_attachments/1111.../ is gone; re-GET returns 404
```

No commit — user commits manually.

---

## Task 4: Wire PM tool env vars to admin (project-management/)

**Files:**
- Modify: `project-management/.env.local`

**Interfaces:**
- Produces: `process.env.ADMIN_API_BASE_URL`, `process.env.PM_SERVICE_KEY` — consumed by Task 5 (Server Action) and Task 6 (Route Handler).

- [ ] **Step 1: Add the two new variables**

Append to `project-management/.env.local`:

```
ADMIN_API_BASE_URL=http://localhost/smith-marketing-group/admin/public
PM_SERVICE_KEY=<same value as admin/.env's pm.serviceKey from Task 2 Step 4>
```

Adjust `ADMIN_API_BASE_URL` to whatever URL your local `admin/` instance is actually reachable at (the XAMPP vhost root pointed at `admin/public`, or `http://localhost:8080` if using the Docker Compose setup from `admin/`'s `CLAUDE.md`).

No test — this is config only, verified implicitly when Task 5/6 make their first real request.

---

## Task 5: Replace attachment Server Actions (project-management/)

**Files:**
- Modify: `project-management/src/app/w/[workspaceId]/p/[projectId]/actions.ts`

**Interfaces:**
- Consumes: `getClient()` (existing helper in this file), `logActivity()` (`@/lib/activity`), `admin/`'s `api/pm/attachments` endpoints (Task 3).
- Produces: `uploadTaskAttachment(workspaceId: string, projectId: string, taskId: string, file: File): Promise<void>` and `deleteAttachment(workspaceId: string, projectId: string, attachmentId: string): Promise<void>` — both consumed by Task 7 (`task-panel.tsx`). **Signature change**: `deleteAttachment` drops its old 4th `storagePath` argument.

- [ ] **Step 1: Replace the "Attachments" section**

Find this block in `project-management/src/app/w/[workspaceId]/p/[projectId]/actions.ts` (the existing `addAttachmentRecord` and `deleteAttachment` functions, under the `// Attachments (file itself is uploaded client-side; this records metadata)` comment) and replace it entirely with:

```ts
// ---------------------------------------------------------------------------
// Attachments (file bytes live in admin/, never touched by the browser — this
// server action is the only thing that holds PM_SERVICE_KEY)
// ---------------------------------------------------------------------------

const ADMIN_API_BASE_URL = process.env.ADMIN_API_BASE_URL!;
const PM_SERVICE_KEY = process.env.PM_SERVICE_KEY!;

export async function uploadTaskAttachment(
  workspaceId: string,
  projectId: string,
  taskId: string,
  file: File,
) {
  const { supabase, user } = await getClient();

  const id = crypto.randomUUID();
  const form = new FormData();
  form.append("id", id);
  form.append("original_name", file.name);
  form.append("file", file, file.name);

  const uploadRes = await fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments`, {
    method: "POST",
    headers: { "X-Pm-Key": PM_SERVICE_KEY },
    body: form,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.json().catch(() => null);
    throw new Error(body?.data?.message ?? "Upload failed");
  }
  const uploaded = (await uploadRes.json()) as {
    data: { storage_path: string; size_bytes: number; mime_type: string };
  };

  const { error } = await supabase.from("attachments").insert({
    id,
    task_id: taskId,
    uploaded_by: user.id,
    storage_path: uploaded.data.storage_path,
    file_name: file.name,
    file_size: uploaded.data.size_bytes,
    mime_type: uploaded.data.mime_type,
  });
  if (error) {
    // Orphan cleanup: the file exists on admin but has no authorized Supabase
    // row pointing at it, so remove it rather than leaking storage.
    await fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments/${id}`, {
      method: "DELETE",
      headers: { "X-Pm-Key": PM_SERVICE_KEY },
    }).catch(() => {});
    throw new Error(error.message);
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("name")
    .eq("id", taskId)
    .maybeSingle();

  await logActivity(supabase, {
    workspaceId,
    projectId,
    taskId,
    actorId: user.id,
    action: "attachment.added",
    entityType: "attachment",
    entityId: id,
    metadata: { file_name: file.name, name: task?.name ?? "a task" },
  });

  revalidatePath(projectPath(workspaceId, projectId));
}

export async function deleteAttachment(
  workspaceId: string,
  projectId: string,
  attachmentId: string,
) {
  const { supabase } = await getClient();
  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  await fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: { "X-Pm-Key": PM_SERVICE_KEY },
  }).catch(() => {});

  revalidatePath(projectPath(workspaceId, projectId));
}
```

- [ ] **Step 2: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: errors only in `task-panel.tsx` (still calling the old signatures) — resolved by Task 7. No errors in `actions.ts` itself.

No commit — user commits manually.

---

## Task 6: Download Route Handler (project-management/)

**Files:**
- Create: `project-management/src/app/api/attachments/[id]/route.ts`

**Interfaces:**
- Consumes: `createClient()` (`@/lib/supabase/server`), `admin/`'s `GET api/pm/attachments/{id}` (Task 3).
- Produces: `GET /api/attachments/{id}` — streams the file with `Content-Type`/`Content-Disposition`, or 401/404/502. Consumed by Task 7's `handleDownload`.

This is the first Route Handler in this codebase (everything else is Server Actions) — necessary here because the browser needs a normal navigable/streamable URL for file download, which a Server Action can't provide.

- [ ] **Step 1: Write the route handler**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_API_BASE_URL = process.env.ADMIN_API_BASE_URL!;
const PM_SERVICE_KEY = process.env.PM_SERVICE_KEY!;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  // RLS (attachments_select) gates this: no row back means no access.
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!attachment) {
    return new NextResponse(null, { status: 404 });
  }

  const adminRes = await fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments/${id}`, {
    headers: { "X-Pm-Key": PM_SERVICE_KEY },
  });
  if (!adminRes.ok || !adminRes.body) {
    return new NextResponse(null, { status: adminRes.status || 502 });
  }

  return new NextResponse(adminRes.body, {
    status: 200,
    headers: {
      "Content-Type": attachment.mime_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.file_name)}"`,
    },
  });
}
```

- [ ] **Step 2: Manual smoke test (unauthenticated case)**

With the PM tool dev server running:

Run: `curl -i http://localhost:3000/api/attachments/11111111-1111-4111-8111-111111111111`
Expected: `HTTP/1.1 401` (no session cookie sent) — confirms the auth gate runs before ever calling admin. Full authorized round-trip is verified in Task 7's manual pass (needs a real attachment created through the UI).

No commit — user commits manually.

---

## Task 7: Wire click / drag-drop / paste in `task-panel.tsx` (project-management/)

**Files:**
- Modify: `project-management/src/components/task-panel.tsx`

**Interfaces:**
- Consumes: `uploadTaskAttachment`, `deleteAttachment` (Task 5), `GET /api/attachments/{id}` (Task 6), `useDropzone` from `react-dropzone` (already an installed dependency — `project-management/package.json`).

- [ ] **Step 1: Add the `react-dropzone` import**

In the imports block (the file currently starts with `"use client";` then imports from `"react"`, `"next/navigation"`, `"sonner"`, `lucide-react`, etc. — see the existing imports 1–59), add:

```tsx
import { useDropzone } from "react-dropzone";
```

- [ ] **Step 2: Replace `handleUpload` and `handleDownload`**

Find this exact block (currently ~lines 214–245):

```tsx
  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${projectId}/${task.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw new Error(error.message);
      await addAttachmentRecord(workspaceId, projectId, task.id, {
        storagePath: path,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: Attachment) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 60);
    if (error || !data) {
      toast.error("Could not create download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }
```

Replace it with:

```tsx
  const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      await Promise.all(
        list.map(async (file) => {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            toast.error(`${file.name} is over the 8MB limit`);
            return;
          }
          try {
            await uploadTaskAttachment(workspaceId, projectId, task.id, file);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : `${file.name} failed to upload`);
          }
        }),
      );
      toast.success(list.length === 1 ? "File attached" : `${list.length} files attached`);
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(attachment: Attachment) {
    window.open(`/api/attachments/${attachment.id}`, "_blank", "noopener");
  }

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => handleUpload(acceptedFiles),
    noClick: true,
    noKeyboard: true,
  });

  useEffect(() => {
    function handleGlobalPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        handleUpload(files);
      }
    }
    document.addEventListener("paste", handleGlobalPaste);
    return () => document.removeEventListener("paste", handleGlobalPaste);
  }, [task.id]);
```

`createClient` (from `@/lib/supabase/client`) may now be unused in this file if nothing else in it calls the browser Supabase client — if `npx eslint` flags the import as unused after this change, remove it; if another block (e.g. a realtime comments subscription) still uses it, leave it.

- [ ] **Step 3: Merge drag handling onto the panel container**

Find the existing `<aside>` opening tag:

```tsx
  <aside
    aria-label={`Task details: ${task.name}`}
    className="sticky top-20 flex h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm"
  >
```

Replace with:

```tsx
  <aside
    {...getRootProps({
      "aria-label": `Task details: ${task.name}`,
      className: cn(
        "sticky top-20 flex h-fit max-h-[calc(100dvh-6rem)] w-96 shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-sm",
        isDragActive && "ring-2 ring-primary",
      ),
    })}
  >
```

(`cn` is already imported in this file from `@/lib/utils`.)

- [ ] **Step 4: Update the attachments list block**

Find this exact block (currently ~lines 590–648):

```tsx
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-medium text-foreground">Attachments</h3>
    <input
      ref={fileInputRef}
      type="file"
      className="sr-only"
      aria-label="Upload attachment"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
        e.target.value = "";
      }}
    />
    <Button
      variant="ghost"
      size="sm"
      disabled={uploading}
      onClick={() => fileInputRef.current?.click()}
    >
      <Paperclip aria-hidden="true" />
      {uploading ? "Uploading..." : "Attach"}
    </Button>
  </div>
  {taskAttachments.length > 0 && (
    <ul className="mt-1 flex flex-col gap-1">
      {taskAttachments.map((a) => (
        <li key={a.id} className="group flex items-center gap-2 text-sm">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-4 hover:underline"
            onClick={() => handleDownload(a)}
          >
            {a.file_name}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${a.file_name}`}
            onClick={() => handleDownload(a)}
          >
            <Download aria-hidden="true" />
          </Button>
          {a.uploaded_by === currentUserId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${a.file_name}`}
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() =>
                run(() => deleteAttachment(workspaceId, projectId, a.id, a.storage_path))
              }
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )}
```

Replace with (adds `multiple`, switches the `onChange` to pass the whole `FileList`, drops the now-removed `storagePath` argument from `deleteAttachment`, and adds a drag-active hint):

```tsx
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-medium text-foreground">Attachments</h3>
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="sr-only"
      aria-label="Upload attachment"
      onChange={(e) => {
        if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
        e.target.value = "";
      }}
    />
    <Button
      variant="ghost"
      size="sm"
      disabled={uploading}
      onClick={() => fileInputRef.current?.click()}
    >
      <Paperclip aria-hidden="true" />
      {uploading ? "Uploading..." : "Attach"}
    </Button>
  </div>
  {isDragActive && (
    <p className="mt-1 rounded border border-dashed border-primary p-2 text-center text-xs text-muted-foreground">
      Drop to attach
    </p>
  )}
  {taskAttachments.length > 0 && (
    <ul className="mt-1 flex flex-col gap-1">
      {taskAttachments.map((a) => (
        <li key={a.id} className="group flex items-center gap-2 text-sm">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-foreground underline-offset-4 hover:underline"
            onClick={() => handleDownload(a)}
          >
            {a.file_name}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${a.file_name}`}
            onClick={() => handleDownload(a)}
          >
            <Download aria-hidden="true" />
          </Button>
          {a.uploaded_by === currentUserId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${a.file_name}`}
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => run(() => deleteAttachment(workspaceId, projectId, a.id))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )}
```

- [ ] **Step 5: Update the import of the attachment actions**

In the existing `import { addAttachmentRecord, addDependency, createComment, ... } from "@/app/w/[workspaceId]/p/[projectId]/actions";` block, replace `addAttachmentRecord` with `uploadTaskAttachment` in the named-import list.

- [ ] **Step 6: Type-check**

Run (from `project-management/`): `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Start the dev server (`npm run dev`), open a task in a project you're a member of (role ≥ commenter), and check:
1. Click "Attach" → pick 2 files at once → both appear in the list.
2. Drag a file from the desktop onto the task panel → "Drop to attach" hint shows while dragging → file appears after drop.
3. Copy an image to the clipboard (e.g. a screenshot) → click into the task panel → `Ctrl+V` → image appears in the list.
4. Click a filename or the download icon → file downloads with its original name and correct bytes.
5. Delete an attachment you uploaded → it disappears from the list and from `admin/writable/uploads/pm_attachments/<id>/` on disk.
6. As a user with no access to that project (or logged out), request `/api/attachments/<id>` directly → 401/404, not the file.
7. Try a >8MB file → rejected client-side with a toast; confirm server-side enforcement too by bypassing the client check (e.g. `curl` straight to admin's endpoint with an oversized file, per Task 3 Step 6) → 400.

No commit — user commits manually.

---

## Self-review

**Spec coverage:** access control (proxy through Next.js, RLS-backed) — Tasks 5–7. Schema reuse (no new Supabase migration) — confirmed, `storage_path` reused as-is. Shared-secret auth — Task 2. Hard delete — Task 3 `delete()`. File-type whitelist + 8MB cap — Task 3 `store()`. Three attach paths — Task 7. Orphan cleanup on failed insert — Task 5. Unauthorized download → 404 — Task 6. All covered.

**Correction from the approved design doc:** the design's admin-side section mentioned adding `X-Pm-Key` to `PublicController::options()`'s CORS allow-list. That's unnecessary and has been dropped — CORS is a browser-enforced mechanism, and the browser never calls `admin/` directly in this design (only the Next.js server does, via plain server-to-server `fetch`). No admin-side CORS change is needed.

**Type consistency:** `uploadTaskAttachment(workspaceId, projectId, taskId, file)` (Task 5) matches its call site in Task 7 Step 2. `deleteAttachment(workspaceId, projectId, attachmentId)` (Task 5, 3-arg) matches its call site in Task 7 Step 4 (dropped the old 4th `storagePath` arg everywhere, including the import list in Task 7 Step 5 which drops `addAttachmentRecord` in favor of `uploadTaskAttachment`).
