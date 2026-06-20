package test.check.inspections.ui

import android.content.Context
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

/**
 * Lightweight in-app localization. English text doubles as the lookup key, so
 * UI just wraps literals in `tr("…")`. Arabic comes from the table; anything
 * missing falls back to English. Defaults to the device language and persists
 * the choice. `Loc.lang` is Compose state, so switching recomposes the UI.
 */
object Loc {
    private const val PREF = "app_prefs"
    private const val KEY = "lang"

    var lang by mutableStateOf("en")
        private set

    fun init(ctx: Context) {
        val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        lang = sp.getString(KEY, null)
            ?: if (java.util.Locale.getDefault().language == "ar") "ar" else "en"
    }

    fun set(ctx: Context, l: String) {
        lang = l
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, l).apply()
    }

    fun toggle(ctx: Context) = set(ctx, if (lang == "ar") "en" else "ar")

    val isRtl get() = lang == "ar"

    fun str(en: String): String = if (lang == "ar") ar[en] ?: en else en

    private val ar = mapOf(
        // Login
        "CHECK House Inspections" to "تشِك لفحص المنازل",
        "Sign in" to "تسجيل الدخول",
        "Signing in…" to "جارٍ تسجيل الدخول…",
        "My Day" to "يومي",
        "Email" to "البريد الإلكتروني",
        "Password" to "كلمة المرور",
        "Demo: admin@check.test / password123" to "تجريبي: admin@check.test / password123",
        "Invalid email or password" to "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        // Home / nav
        "Log out" to "تسجيل الخروج",
        "Sync now" to "مزامنة الآن",
        "Inspection" to "الفحص",
        "Inspections" to "عمليات الفحص",
        "Nothing to show." to "لا يوجد ما يُعرض.",
        // Detail
        "Sign" to "توقيع",
        "Signatures" to "التواقيع",
        "Manager approval" to "موافقة المدير",
        "Approve & sign" to "اعتماد وتوقيع",
        "🔒 Approved & locked" to "🔒 معتمد ومقفل",
        "Take photo" to "التقاط صورة",
        "Choose" to "اختيار",
        "Good" to "جيد",
        "Issue" to "مشكلة",
        "N/A" to "لا ينطبق",
        // New inspection
        "Customer" to "العميل",
        "Name" to "الاسم",
        "Phone" to "الهاتف",
        "Property" to "العقار",
        "Address" to "العنوان",
        "Pick on map" to "تحديد على الخريطة",
        "Change location" to "تغيير الموقع",
        "Saving…" to "جارٍ الحفظ…",
        "Type" to "النوع",
        "Inspection type" to "نوع الفحص",
        "New Inspection" to "فحص جديد",
        "Cancel" to "إلغاء",
        "Next" to "التالي",
        // Assign team
        "Schedule" to "الجدولة",
        "Date (YYYY-MM-DD)" to "التاريخ (سنة-شهر-يوم)",
        "Assign inspectors" to "تعيين المفتشين",
        "Assign Team" to "تعيين الفريق",
        "— none —" to "— لا أحد —",
        "Pick an inspector for each discipline you need. Leave others empty."
            to "اختر مفتشاً لكل تخصص تحتاجه. اترك الباقي فارغاً.",
        "Save" to "حفظ",
        // Users
        "Team" to "الفريق",
        "Add User" to "إضافة مستخدم",
        "Password (min 6)" to "كلمة المرور (6 أحرف على الأقل)",
        "Role" to "الدور",
        "Discipline" to "التخصص",
        "Inspector" to "مفتش",
        "Manager" to "مدير",
        "Admin" to "مسؤول",
        "Create" to "إنشاء",
        // Signature / pickers
        "Clear" to "مسح",
        "Use photo" to "استخدام الصورة",
        "Mark the issue" to "حدّد المشكلة",
        "Use this location" to "استخدام هذا الموقع",
        "Tap the map to drop a pin" to "اضغط على الخريطة لوضع علامة",
        "Pick location" to "اختيار الموقع",
        // Discipline labels
        "Civil" to "مدني",
        "Electrical" to "كهربائي",
        "Plumbing" to "سباكة",
        "Pest / Other" to "آفات / أخرى",
        // Status labels
        "Draft" to "مسودة",
        "In progress" to "قيد التنفيذ",
        "In review" to "قيد المراجعة",
        "Completed" to "مكتمل",
        "Reported" to "صدر التقرير",
        "Pending" to "قيد الانتظار",
        "Signed" to "موقّع",
        // Property types
        "Apartment" to "شقة",
        "House" to "منزل",
    )
}

/** Translate an English string to the current language (recomposes on switch). */
@Composable
fun tr(en: String): String {
    Loc.lang // read state so this recomposes when the language changes
    return Loc.str(en)
}

/** Reusable language switch button (login + in-app menu). */
@Composable
fun LanguageToggle() {
    val ctx = LocalContext.current
    TextButton(onClick = { Loc.toggle(ctx) }) {
        Text(if (Loc.lang == "ar") "English" else "العربية")
    }
}
