"""Curated UI locale catalogs (spec §8.1).

Fixed UI strings only — decision codes, amounts, IDs, and evidence IDs are
canonical and NEVER translated. Translations below are curated seeds and are
flagged review_pending until a human translator signs off; the frontend must
show canonical English alongside high-impact consent/repayment text while
review_pending is true.
"""

from __future__ import annotations

LOCALES = ["en", "hi", "bn", "ta", "te", "kn"]

# Financial glossary terms are locked per language: the same source term must
# always map to the same target term.
GLOSSARY: dict[str, dict[str, str]] = {
    "hi": {"credit": "क्रेडिट", "repayment": "पुनर्भुगतान", "vault": "वॉल्ट", "escrow": "एस्क्रो"},
    "bn": {"credit": "ক্রেডিট", "repayment": "পরিশোধ", "vault": "ভল্ট", "escrow": "এসক্রো"},
    "ta": {"credit": "கடன்", "repayment": "திருப்பிச் செலுத்துதல்", "vault": "பாதுகாப்பு பெட்டகம்", "escrow": "எஸ்க்ரோ"},
    "te": {"credit": "క్రెడిట్", "repayment": "తిరిగి చెల్లింపు", "vault": "వాల్ట్", "escrow": "ఎస్క్రో"},
    "kn": {"credit": "ಕ್ರೆಡಿಟ್", "repayment": "ಮರುಪಾವತಿ", "vault": "ವಾಲ್ಟ್", "escrow": "ಎಸ್ಕ್ರೊ"},
}

CATALOGS: dict[str, dict[str, str]] = {
    "en": {
        "app.title": "CredenceAI — Agent Credit (Sandbox)",
        "banner.test_credits": "Test credits only. No real money.",
        "passport.title": "Agent Passport",
        "passport.verified": "Passport verified",
        "passport.revoked": "Passport revoked",
        "credit.requested": "Requested credit",
        "credit.approved_limit": "Approved limit",
        "credit.decision.approved": "Approved",
        "credit.decision.rejected": "Rejected",
        "credit.decision.review": "Human review required",
        "vault.spent": "Spent",
        "vault.remaining": "Remaining",
        "vault.frozen": "Vault frozen",
        "repayment.waterfall": "Repayment waterfall",
        "repayment.owner_release": "Released to owner",
        "consent.mandate": "I authorize task revenue to be collected into escrow and applied to repayment before any release to me.",
        "killswitch.button": "Emergency freeze",
    },
    "hi": {
        "app.title": "CredenceAI — एजेंट क्रेडिट (सैंडबॉक्स)",
        "banner.test_credits": "केवल परीक्षण क्रेडिट। कोई वास्तविक धन नहीं।",
        "passport.title": "एजेंट पासपोर्ट",
        "passport.verified": "पासपोर्ट सत्यापित",
        "passport.revoked": "पासपोर्ट निरस्त",
        "credit.requested": "अनुरोधित क्रेडिट",
        "credit.approved_limit": "स्वीकृत सीमा",
        "credit.decision.approved": "स्वीकृत",
        "credit.decision.rejected": "अस्वीकृत",
        "credit.decision.review": "मानव समीक्षा आवश्यक",
        "vault.spent": "खर्च",
        "vault.remaining": "शेष",
        "vault.frozen": "वॉल्ट फ़्रीज़",
        "repayment.waterfall": "पुनर्भुगतान वॉटरफ़ॉल",
        "repayment.owner_release": "स्वामी को जारी",
        "consent.mandate": "मैं अधिकृत करता/करती हूं कि कार्य राजस्व एस्क्रो में एकत्र होकर पहले पुनर्भुगतान में लगाया जाए, उसके बाद ही मुझे जारी हो।",
        "killswitch.button": "आपातकालीन फ़्रीज़",
    },
    "bn": {
        "app.title": "CredenceAI — এজেন্ট ক্রেডিট (স্যান্ডবক্স)",
        "banner.test_credits": "শুধুমাত্র পরীক্ষামূলক ক্রেডিট। প্রকৃত অর্থ নয়।",
        "passport.title": "এজেন্ট পাসপোর্ট",
        "passport.verified": "পাসপোর্ট যাচাইকৃত",
        "passport.revoked": "পাসপোর্ট বাতিল",
        "credit.requested": "অনুরোধকৃত ক্রেডিট",
        "credit.approved_limit": "অনুমোদিত সীমা",
        "credit.decision.approved": "অনুমোদিত",
        "credit.decision.rejected": "প্রত্যাখ্যাত",
        "credit.decision.review": "মানব পর্যালোচনা প্রয়োজন",
        "vault.spent": "ব্যয়িত",
        "vault.remaining": "অবশিষ্ট",
        "vault.frozen": "ভল্ট স্থগিত",
        "repayment.waterfall": "পরিশোধ ওয়াটারফল",
        "repayment.owner_release": "মালিককে প্রদত্ত",
        "consent.mandate": "আমি অনুমোদন করছি যে কাজের আয় এসক্রোতে সংগৃহীত হবে এবং আমাকে দেওয়ার আগে পরিশোধে প্রয়োগ হবে।",
        "killswitch.button": "জরুরি ফ্রিজ",
    },
    "ta": {
        "app.title": "CredenceAI — ஏஜென்ட் கடன் (சாண்ட்பாக்ஸ்)",
        "banner.test_credits": "சோதனை கடன்கள் மட்டும். உண்மையான பணம் இல்லை.",
        "passport.title": "ஏஜென்ட் பாஸ்போர்ட்",
        "passport.verified": "பாஸ்போர்ட் சரிபார்க்கப்பட்டது",
        "passport.revoked": "பாஸ்போர்ட் ரத்து",
        "credit.requested": "கோரிய கடன்",
        "credit.approved_limit": "அங்கீகரிக்கப்பட்ட வரம்பு",
        "credit.decision.approved": "அங்கீகரிக்கப்பட்டது",
        "credit.decision.rejected": "நிராகரிக்கப்பட்டது",
        "credit.decision.review": "மனித மதிப்பாய்வு தேவை",
        "vault.spent": "செலவழிக்கப்பட்டது",
        "vault.remaining": "மீதம்",
        "vault.frozen": "பெட்டகம் முடக்கப்பட்டது",
        "repayment.waterfall": "திருப்பிச் செலுத்தும் வரிசை",
        "repayment.owner_release": "உரிமையாளருக்கு வழங்கப்பட்டது",
        "consent.mandate": "பணி வருவாய் எஸ்க்ரோவில் சேகரிக்கப்பட்டு, எனக்கு வழங்கப்படும் முன் திருப்பிச் செலுத்தலில் பயன்படுத்த நான் அங்கீகரிக்கிறேன்.",
        "killswitch.button": "அவசர முடக்கம்",
    },
    "te": {
        "app.title": "CredenceAI — ఏజెంట్ క్రెడిట్ (శాండ్‌బాక్స్)",
        "banner.test_credits": "పరీక్ష క్రెడిట్లు మాత్రమే. నిజమైన డబ్బు కాదు.",
        "passport.title": "ఏజెంట్ పాస్‌పోర్ట్",
        "passport.verified": "పాస్‌పోర్ట్ ధృవీకరించబడింది",
        "passport.revoked": "పాస్‌పోర్ట్ రద్దు చేయబడింది",
        "credit.requested": "అభ్యర్థించిన క్రెడిట్",
        "credit.approved_limit": "ఆమోదించిన పరిమితి",
        "credit.decision.approved": "ఆమోదించబడింది",
        "credit.decision.rejected": "తిరస్కరించబడింది",
        "credit.decision.review": "మానవ సమీక్ష అవసరం",
        "vault.spent": "ఖర్చు చేసినది",
        "vault.remaining": "మిగిలినది",
        "vault.frozen": "వాల్ట్ స్తంభింపజేయబడింది",
        "repayment.waterfall": "తిరిగి చెల్లింపు వాటర్‌ఫాల్",
        "repayment.owner_release": "యజమానికి విడుదల",
        "consent.mandate": "పని ఆదాయం ఎస్క్రోలో సేకరించి, నాకు విడుదల చేసే ముందు తిరిగి చెల్లింపుకు వర్తింపజేయడానికి నేను అధికారం ఇస్తున్నాను.",
        "killswitch.button": "అత్యవసర స్తంభన",
    },
    "kn": {
        "app.title": "CredenceAI — ಏಜೆಂಟ್ ಕ್ರೆಡಿಟ್ (ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್)",
        "banner.test_credits": "ಪರೀಕ್ಷಾ ಕ್ರೆಡಿಟ್‌ಗಳು ಮಾತ್ರ. ನಿಜವಾದ ಹಣವಲ್ಲ.",
        "passport.title": "ಏಜೆಂಟ್ ಪಾಸ್‌ಪೋರ್ಟ್",
        "passport.verified": "ಪಾಸ್‌ಪೋರ್ಟ್ ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
        "passport.revoked": "ಪಾಸ್‌ಪೋರ್ಟ್ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ",
        "credit.requested": "ಕೋರಿದ ಕ್ರೆಡಿಟ್",
        "credit.approved_limit": "ಅನುಮೋದಿತ ಮಿತಿ",
        "credit.decision.approved": "ಅನುಮೋದಿಸಲಾಗಿದೆ",
        "credit.decision.rejected": "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ",
        "credit.decision.review": "ಮಾನವ ಪರಿಶೀಲನೆ ಅಗತ್ಯ",
        "vault.spent": "ಖರ್ಚು ಮಾಡಲಾಗಿದೆ",
        "vault.remaining": "ಉಳಿದಿದೆ",
        "vault.frozen": "ವಾಲ್ಟ್ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗಿದೆ",
        "repayment.waterfall": "ಮರುಪಾವತಿ ವಾಟರ್‌ಫಾಲ್",
        "repayment.owner_release": "ಮಾಲೀಕರಿಗೆ ಬಿಡುಗಡೆ",
        "consent.mandate": "ಕೆಲಸದ ಆದಾಯವನ್ನು ಎಸ್ಕ್ರೊದಲ್ಲಿ ಸಂಗ್ರಹಿಸಿ, ನನಗೆ ಬಿಡುಗಡೆ ಮಾಡುವ ಮೊದಲು ಮರುಪಾವತಿಗೆ ಅನ್ವಯಿಸಲು ನಾನು ಅಧಿಕಾರ ನೀಡುತ್ತೇನೆ.",
        "killswitch.button": "ತುರ್ತು ಸ್ಥಗಿತ",
    },
}

REVIEW_PENDING = {loc: loc != "en" for loc in LOCALES}
