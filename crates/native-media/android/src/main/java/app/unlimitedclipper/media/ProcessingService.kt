package app.unlimitedclipper.media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.arthenica.ffmpegkit.FFmpegKit
import java.util.concurrent.atomic.AtomicInteger

class ProcessingService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel("processing", getString(R.string.processing_title), NotificationManager.IMPORTANCE_LOW)
        )
        val notification = NotificationCompat.Builder(this, "processing")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.processing_title))
            .setContentText(getString(R.string.processing_detail))
            .setOngoing(true)
            .build()
        startForeground(1, notification)
        val power = getSystemService(PowerManager::class.java)
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "UnlimitedClipper:processing")
        wakeLock?.acquire(6 * 60 * 60 * 1000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (active.get() == 0) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        FFmpegKit.cancel()
        stopSelf()
    }

    override fun onDestroy() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    companion object {
        private val active = AtomicInteger(0)

        fun acquire(context: Context) {
            if (active.incrementAndGet() == 1) {
                try {
                    context.startForegroundService(Intent(context, ProcessingService::class.java))
                } catch (error: Exception) {
                    active.decrementAndGet()
                    throw error
                }
            }
        }

        fun release(context: Context) {
            if (active.updateAndGet { count -> (count - 1).coerceAtLeast(0) } == 0) {
                context.stopService(Intent(context, ProcessingService::class.java))
            }
        }
    }
}
