import SwiftUI

/// Lightweight in-app localization. The English text doubles as the lookup key,
/// so views just wrap literals in `loc.t("…")`. Arabic comes from the table
/// below; anything missing falls back to the English key. Language is persisted
/// and defaults to the device language (Arabic phones → Arabic, else English).
final class Loc: ObservableObject {
    static let shared = Loc()

    @Published var lang: String {
        didSet { UserDefaults.standard.set(lang, forKey: "appLang") }
    }

    private init() { lang = Loc.initial() }

    static func initial() -> String {
        if let saved = UserDefaults.standard.string(forKey: "appLang") { return saved }
        let code = (Locale.preferredLanguages.first ?? "en").prefix(2).lowercased()
        return code == "ar" ? "ar" : "en"
    }

    var isRTL: Bool { lang == "ar" }
    var locale: Locale { Locale(identifier: lang) }
    func toggle() { lang = (lang == "ar" ? "en" : "ar") }

    /// Translate an English string to the current language.
    func t(_ en: String) -> String {
        lang == "ar" ? (Self.ar[en] ?? en) : en
    }

    static let ar: [String: String] = [
        // Login
        "CHECK House Inspections": "تشِك لفحص المنازل",
        "Sign in": "تسجيل الدخول",
        "Email": "البريد الإلكتروني",
        "Password": "كلمة المرور",
        "Signing in…": "جارٍ تسجيل الدخول…",
        "Demo: admin@check.test / password123": "تجريبي: admin@check.test / password123",
        "Invalid email or password": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        // Home / navigation
        "Log out": "تسجيل الخروج",
        "Sync now": "مزامنة الآن",
        "Offline · showing saved data": "غير متصل · عرض البيانات المحفوظة",
        "Offline": "غير متصل",
        "pending": "قيد الانتظار",
        "Syncing…": "جارٍ المزامنة…",
        "My Day": "يومي",
        "No jobs scheduled for this day.": "لا توجد مهام مجدولة لهذا اليوم.",
        "Inspections": "عمليات الفحص",
        "No inspections yet.": "لا توجد عمليات فحص بعد.",
        "Date": "التاريخ",
        // Inspection detail
        "Inspection": "الفحص",
        "Sign": "توقيع",
        "Approved & locked": "معتمد ومقفل",
        "Room": "الغرفة",
        "Add a note…": "إضافة ملاحظة…",
        "Take photo": "التقاط صورة",
        "Choose photo": "اختيار صورة",
        "Signatures": "التواقيع",
        "Manager approval": "موافقة المدير",
        "Approve & sign": "اعتماد وتوقيع",
        "Good": "جيد",
        "Issue": "مشكلة",
        "N/A": "لا ينطبق",
        // Staff: new inspection
        "Customer": "العميل",
        "Name": "الاسم",
        "Phone": "الهاتف",
        "Property": "العقار",
        "Address": "العنوان",
        "Pick on map": "تحديد على الخريطة",
        "Change location": "تغيير الموقع",
        "Type": "النوع",
        "Inspection type": "نوع الفحص",
        "New Inspection": "فحص جديد",
        "Cancel": "إلغاء",
        "Next": "التالي",
        // Assign team
        "Schedule": "الجدولة",
        "Assign inspectors": "تعيين المفتشين",
        "— none —": "— لا أحد —",
        "Pick an inspector for each discipline you need. Leave others as none.":
            "اختر مفتشاً لكل تخصص تحتاجه. اترك الباقي بدون تعيين.",
        "Assign Team": "تعيين الفريق",
        "Saving…": "جارٍ الحفظ…",
        "Save": "حفظ",
        // Users / team
        "Team": "الفريق",
        "Account": "الحساب",
        "Password (min 6)": "كلمة المرور (6 أحرف على الأقل)",
        "Role": "الدور",
        "Inspector": "مفتش",
        "Manager": "مدير",
        "Admin": "مسؤول",
        "Discipline": "التخصص",
        "Add User": "إضافة مستخدم",
        "Create": "إنشاء",
        "Done": "تم",
        // Signature / pickers
        "Clear": "مسح",
        "Mark the issue": "حدّد المشكلة",
        "Use photo": "استخدام الصورة",
        "Use this location": "استخدام هذا الموقع",
        "Tap the map to drop a pin": "اضغط على الخريطة لوضع علامة",
        "Pick location": "اختيار الموقع",
        // Discipline labels
        "Civil": "مدني",
        "Electrical": "كهربائي",
        "Plumbing": "سباكة",
        "Pest / Other": "آفات / أخرى",
        // Status labels
        "Draft": "مسودة",
        "In progress": "قيد التنفيذ",
        "In review": "قيد المراجعة",
        "Completed": "مكتمل",
        "Reported": "صدر التقرير",
        "Pending": "قيد الانتظار",
        "Signed": "موقّع",
        // Property types
        "Apartment": "شقة",
        "House": "منزل",
    ]
}

/// Reusable globe button that flips the language. Use on the login screen and
/// in the in-app menu.
struct LanguageToggle: View {
    @EnvironmentObject var loc: Loc
    var body: some View {
        Button { withAnimation { loc.toggle() } } label: {
            Label(loc.lang == "ar" ? "English" : "العربية", systemImage: "globe")
        }
    }
}
