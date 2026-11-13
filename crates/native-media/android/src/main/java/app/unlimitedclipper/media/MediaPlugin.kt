package app.unlimitedclipper.media

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFprobeSession
import com.arthenica.ffmpegkit.ReturnCode
import com.arthenica.ffmpegkit.Session
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@InvokeArg
class OperationArgs {
    lateinit var id: String
    var name: String = ""
    var arguments: Array<String> = emptyArray()
    var progress: Channel? = null
}

@InvokeArg
class DocumentArgs {
    lateinit var path: String
    var name: String = ""
    var mime: String = "application/octet-stream"
}

private class Operation {
    var cancelled = false
    var session: Session? = null
}

@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {
    private val operations = ConcurrentHashMap<String, Operation>()
    private val files = Executors.newSingleThreadExecutor()

    @Command
    fun prepare(invoke: Invoke) {
        val args = invoke.parseArgs(OperationArgs::class.java)
        if (operations.putIfAbsent(args.id, Operation()) != null) {
            invoke.reject("Native operation already exists.")
            return
        }
        invoke.resolve(JSObject())
    }

    @Command
    fun cancel(invoke: Invoke) {
        val args = invoke.parseArgs(OperationArgs::class.java)
        operations[args.id]?.let { operation ->
            synchronized(operation) {
                operation.cancelled = true
                operation.session?.let { session ->
                    FFmpegKit.cancel(session.getSessionId())
                }
            }
        }
        invoke.resolve(JSObject())
    }

    @Command
    fun execute(invoke: Invoke) {
        val args = invoke.parseArgs(OperationArgs::class.java)
        val operation = operations[args.id]
        if (operation == null) {
            invoke.reject("Prepare the native operation before execution.")
            return
        }
        synchronized(operation) {
            if (operation.cancelled) {
                operations.remove(args.id)
                invoke.reject("Job cancelled.")
                return
            }
            try {
                ProcessingService.acquire(activity)
                when (args.name) {
                    "ffmpeg" -> {
                        val session = FFmpegSession.create(
                            args.arguments,
                            { complete -> finish(invoke, args.id, complete) },
                            null,
                            { statistics ->
                                args.progress?.send(JSObject().put("elapsed_ms", statistics.time.toLong()))
                            }
                        )
                        operation.session = session
                        FFmpegKitConfig.asyncFFmpegExecute(session)
                    }
                    "ffprobe" -> {
                        val session = FFprobeSession.create(
                            args.arguments,
                            { complete -> finish(invoke, args.id, complete) },
                            null
                        )
                        operation.session = session
                        FFmpegKitConfig.asyncFFprobeExecute(session)
                    }
                    else -> throw IllegalArgumentException("Unsupported native tool.")
                }
            } catch (error: Exception) {
                operations.remove(args.id)
                ProcessingService.release(activity)
                invoke.reject(error.message ?: "Could not start native media processing.")
            }
        }
    }

    private fun finish(invoke: Invoke, id: String, session: Session) {
        operations.remove(id)
        ProcessingService.release(activity)
        val output = session.getAllLogsAsString(5000)
        if (ReturnCode.isSuccess(session.getReturnCode())) {
            invoke.resolve(JSObject().put("output", output))
        } else {
            invoke.reject(output.takeLast(8192).ifEmpty { "Native media execution failed." })
        }
    }

    private fun managedFile(path: String): File {
        val file = File(path).canonicalFile
        val root = activity.filesDir.canonicalFile
        require(file.path.startsWith(root.path + File.separator)) {
            "Native file access must stay in private application storage."
        }
        return file
    }

    @Command
    fun importVideo(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        try {
            managedFile(args.path).mkdirs()
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("video/*")
            startActivityForResult(invoke, intent, "importResult")
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Could not open the document picker.")
        }
    }

    @ActivityCallback
    fun importResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.resolve(JSObject().put("path", null))
            return
        }
        files.execute {
            var temporary: File? = null
            try {
                val args = invoke.parseArgs(DocumentArgs::class.java)
                val uri = result.data?.data ?: error("The picker returned no document.")
                val resolver = activity.contentResolver
                var name = "Imported video.mp4"
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        name = cursor.getString(0) ?: name
                    }
                }
                val extension = name.substringAfterLast('.', "mp4").lowercase()
                require(extension in setOf("mp4", "mov", "mkv", "webm", "avi", "m4v", "ts")) {
                    "Choose a supported video document."
                }
                val destination = File(managedFile(args.path), UUID.randomUUID().toString() + "." + extension)
                val pending = File(destination.path + ".part")
                temporary = pending
                resolver.openInputStream(uri).use { input ->
                    requireNotNull(input) { "Could not read the selected document." }
                    pending.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                check(pending.renameTo(destination)) { "Could not commit the imported document." }
                invoke.resolve(JSObject().put("path", destination.path).put("name", name))
            } catch (error: Exception) {
                temporary?.delete()
                invoke.reject(error.message ?: "Could not copy the selected document.")
            }
        }
    }

    @Command
    fun saveDocument(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        try {
            require(managedFile(args.path).isFile) { "The managed export no longer exists." }
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(args.mime)
                .putExtra(Intent.EXTRA_TITLE, args.name)
            startActivityForResult(invoke, intent, "saveResult")
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Could not open the export destination.")
        }
    }

    @ActivityCallback
    fun saveResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.resolve(JSObject().put("saved", false))
            return
        }
        files.execute {
            try {
                val args = invoke.parseArgs(DocumentArgs::class.java)
                val uri = result.data?.data ?: error("The picker returned no destination.")
                managedFile(args.path).inputStream().use { input ->
                    activity.contentResolver.openOutputStream(uri, "wt").use { output ->
                        requireNotNull(output) { "Could not write the selected destination." }
                        input.copyTo(output)
                    }
                }
                invoke.resolve(JSObject().put("saved", true))
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Could not save the exported document.")
            }
        }
    }
}
