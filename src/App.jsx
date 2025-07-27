// src/App.jsx
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid'; // Benzersiz ID'ler için

// Canvas ortamından sağlanan global değişkenler (Firebase yapılandırması ve yetkilendirme)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // Kimlik doğrulama hazır mı?
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true); // Hata düzeltildi: setLoading başlangıç değeri useState(true) olmalıydı
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  // Yeni şablon formu için durum değişkenleri
  const [templateName, setTemplateName] = useState('');
  const [pageSizeType, setPageSizeType] = useState('A4'); // Sayfa boyutu tipi (A4, A5, Letter, Custom)
  const [customPageWidth, setCustomPageWidth] = useState(''); // Özel sayfa genişliği
  const [customPageHeight, setCustomPageHeight] = useState(''); // Özel sayfa yüksekliği
  const [marginTop, setMarginTop] = useState('10');
  const [marginRight, setMarginRight] = useState('10');
  const [marginBottom, setMarginBottom] = useState('10');
  const [marginLeft, setMarginLeft] = useState('10');
  const [labelWidth, setLabelWidth] = useState('50');
  const [labelHeight, setLabelHeight] = useState('30');
  const [gapHorizontal, setGapHorizontal] = useState('5'); // Etiketler arası yatay boşluk
  const [gapVertical, setGapVertical] = useState('5');   // Etiketler arası dikey boşluk
  const [editingTemplate, setEditingTemplate] = useState(null); // Düzenlenen şablonu tutar

  // Firebase'i başlat ve kullanıcı kimlik doğrulamasını yap
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestore);
      setAuth(firebaseAuth);

      // Kimlik doğrulama durumu değiştiğinde çalışır
      onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // Kullanıcı giriş yapmışsa UID'sini al
          setUserId(user.uid);
        } else {
          // Kullanıcı giriş yapmamışsa ve özel token yoksa anonim olarak giriş yap
          if (!initialAuthToken) {
            try {
              const anonUserCredential = await signInAnonymously(firebaseAuth);
              setUserId(anonUserCredential.user.uid);
            } catch (anonError) {
              console.error("Anonim giriş hatası:", anonError);
              setError("Uygulama için kullanıcı girişi yapılamadı.");
            }
          } else {
            // Özel token varsa onunla giriş yap
            try {
              const customUserCredential = await signInWithCustomToken(firebaseAuth, initialAuthToken);
              setUserId(customUserCredential.user.uid);
            } catch (tokenError) {
              console.error("Özel token ile giriş hatası:", tokenError);
              setError("Özel token ile kullanıcı girişi yapılamadı. Anonim giriş denenecek.");
              // Özel token başarısız olursa anonim girişe geri dön
              try {
                const anonUserCredential = await signInAnonymously(firebaseAuth);
                setUserId(anonUserCredential.user.uid);
              } catch (anonError) {
                console.error("Anonim giriş hatası (token sonrası):", anonError);
                setError("Kullanıcı girişi yapılamadı.");
              }
            }
          }
        }
        setIsAuthReady(true); // Kimlik doğrulama işlemi tamamlandı
      });
    } catch (err) {
      console.error("Firebase başlatılırken hata:", err);
      setError("Uygulama başlatılırken bir sorun oluştu. Lütfen konsolu kontrol edin.");
    }
  }, []);

  // Kimlik doğrulama hazır olduğunda ve userId mevcut olduğunda şablonları çek
  useEffect(() => {
    if (isAuthReady && userId && db) {
      fetchTemplates();
    }
  }, [isAuthReady, userId, db]); // Bağımlılıklar değiştiğinde tekrar çalışır

  // Şablonları Firestore'dan çekme fonksiyonu
  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      // Kullanıcıya özel şablon koleksiyonuna referans
      const templatesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/templates`);
      const q = query(templatesCollectionRef); // Firestore'da orderBy kullanmaktan kaçınıyoruz
      const querySnapshot = await getDocs(q);
      const fetchedTemplates = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTemplates(fetchedTemplates);
    } catch (err) {
      console.error("Şablonlar çekilirken hata oluştu:", err);
      setError("Şablonlar yüklenirken bir sorun oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // Kullanıcıya kısa süreli mesaj gösterme fonksiyonu
  const showMessage = (msg, type = 'success') => {
    setMessage({ text: msg, type: type });
    setTimeout(() => setMessage(''), 3000); // 3 saniye sonra mesajı temizle
  };

  // Şablon gönderme (kaydetme veya güncelleme) işlemi
  const handleSubmitTemplate = async (e) => {
    e.preventDefault();
    setError(null); // Önceki hataları temizle

    // Giriş alanlarının doğrulanması
    const parsedMarginTop = parseFloat(marginTop);
    const parsedMarginRight = parseFloat(marginRight);
    const parsedMarginBottom = parseFloat(marginBottom);
    const parsedMarginLeft = parseFloat(marginLeft);
    const parsedLabelWidth = parseFloat(labelWidth);
    const parsedLabelHeight = parseFloat(labelHeight);
    const parsedGapHorizontal = parseFloat(gapHorizontal);
    const parsedGapVertical = parseFloat(gapVertical);

    if (
      !templateName.trim() ||
      isNaN(parsedMarginTop) || isNaN(parsedMarginRight) || isNaN(parsedMarginBottom) || isNaN(parsedMarginLeft) ||
      isNaN(parsedLabelWidth) || isNaN(parsedLabelHeight) ||
      isNaN(parsedGapHorizontal) || isNaN(parsedGapVertical) ||
      parsedMarginTop < 0 || parsedMarginRight < 0 || parsedMarginBottom < 0 || parsedMarginLeft < 0 ||
      parsedLabelWidth <= 0 || parsedLabelHeight <= 0 ||
      parsedGapHorizontal < 0 || parsedGapVertical < 0
    ) {
      setError("Lütfen tüm alanları doğru ve pozitif değerlerle doldurun.");
      return;
    }

    let pageSize = {};
    // Seçilen sayfa boyutuna göre genişlik ve yükseklik ayarla
    if (pageSizeType === 'A4') {
      pageSize = { type: 'A4', width: 210, height: 297 }; // mm
    } else if (pageSizeType === 'A5') {
      pageSize = { type: 'A5', width: 148, height: 210 }; // mm
    } else if (pageSizeType === 'Letter') {
      pageSize = { type: 'Letter', width: 215.9, height: 279.4 }; // mm
    } else if (pageSizeType === 'Custom') {
      const parsedCustomWidth = parseFloat(customPageWidth);
      const parsedCustomHeight = parseFloat(customPageHeight);
      if (isNaN(parsedCustomWidth) || parsedCustomWidth <= 0 || isNaN(parsedCustomHeight) || parsedCustomHeight <= 0) {
        setError("Lütfen özel sayfa boyutları için geçerli genişlik ve yükseklik girin.");
        return;
      }
      pageSize = { type: 'Custom', width: parsedCustomWidth, height: parsedCustomHeight };
    }

    // Şablon verilerini hazırla
    const templateData = {
      name: templateName.trim(),
      pageSize: pageSize,
      margins: {
        top: parsedMarginTop,
        right: parsedMarginRight,
        bottom: parsedMarginBottom,
        left: parsedMarginLeft,
      },
      labelDimensions: {
        width: parsedLabelWidth,
        height: parsedLabelHeight,
      },
      gapHorizontal: parsedGapHorizontal,
      gapVertical: parsedGapVertical,
      userId: userId, // Güvenlik kuralları için userId'yi kaydet
      createdAt: new Date().toISOString(), // Oluşturulma tarihi
    };

    try {
      if (editingTemplate) {
        // Mevcut şablonu güncelle
        const templateDocRef = doc(db, `artifacts/${appId}/users/${userId}/templates`, editingTemplate.id);
        await updateDoc(templateDocRef, templateData);
        showMessage('Şablon başarıyla güncellendi!', 'success');
        setEditingTemplate(null); // Düzenleme modundan çık
      } else {
        // Yeni şablon ekle
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/templates`), templateData);
        showMessage('Şablon başarıyla kaydedildi!', 'success');
      }
      resetForm(); // Formu temizle
      fetchTemplates(); // Listeyi yenile
    } catch (err) {
      console.error("Şablon kaydedilirken/güncellenirken hata:", err);
      setError("Şablon kaydedilirken/güncellenirken bir sorun oluştu.");
    }
  };

  // Şablonu düzenleme moduna alma
  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setPageSizeType(template.pageSize.type);
    if (template.pageSize.type === 'Custom') {
      setCustomPageWidth(template.pageSize.width.toString());
      setCustomPageHeight(template.pageSize.height.toString());
    } else {
      setCustomPageWidth('');
      setCustomPageHeight('');
    }
    setMarginTop(template.margins.top.toString());
    setMarginRight(template.margins.right.toString());
    setMarginBottom(template.margins.bottom.toString());
    setMarginLeft(template.margins.left.toString());
    setLabelWidth(template.labelDimensions.width.toString());
    setLabelHeight(template.labelDimensions.height.toString());
    setGapHorizontal(template.gapHorizontal.toString());
    setGapVertical(template.gapVertical.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Formun üstüne kaydır
  };

  // Şablonu silme işlemi
  const handleDeleteTemplate = async (templateId) => {
    // Kullanıcıya onay sorusu
    if (!window.confirm('Bu şablonu silmek istediğinizden emin misiniz?')) {
      return;
    }
    setError(null);
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/templates`, templateId));
      showMessage('Şablon başarıyla silindi!', 'success');
      fetchTemplates(); // Listeyi yenile
      // Eğer silinen şablon düzenleme modundaysa formu temizle
      if (editingTemplate && editingTemplate.id === templateId) {
        resetForm();
        setEditingTemplate(null);
      }
    } catch (err) {
      console.error("Şablon silinirken hata:", err);
      setError("Şablon silinirken bir sorun oluştu.");
    }
  };

  // Formu başlangıç durumuna sıfırlama
  const resetForm = () => {
    setTemplateName('');
    setPageSizeType('A4');
    setCustomPageWidth('');
    setCustomPageHeight('');
    setMarginTop('10');
    setMarginRight('10');
    setMarginBottom('10');
    setMarginLeft('10');
    setLabelWidth('50');
    setLabelHeight('30');
    setGapHorizontal('5');
    setGapVertical('5');
    setEditingTemplate(null);
  };

  // Kimlik doğrulama hazır değilse yükleniyor mesajı göster
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex items-center justify-center p-4 font-inter">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <p className="text-gray-700 text-lg">Uygulama yükleniyor ve kimlik doğrulanıyor...</p>
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex flex-col items-center justify-center p-4 font-inter">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl mb-8">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">Etiket Baskı Şablon Yöneticisi</h1>

        {/* Kullanıcı ID'sini göster */}
        {userId && (
          <div className="text-center text-sm text-gray-600 mb-4 p-2 bg-gray-100 rounded-lg">
            Kullanıcı ID: <span className="font-mono break-all">{userId}</span>
          </div>
        )}

        <form onSubmit={handleSubmitTemplate} className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-700 border-b pb-2">
            {editingTemplate ? 'Şablonu Düzenle' : 'Yeni Şablon Oluştur'}
          </h2>

          {/* Şablon Adı */}
          <div>
            <label htmlFor="templateName" className="block text-gray-700 text-sm font-bold mb-2">
              Şablon Adı:
            </label>
            <input
              type="text"
              id="templateName"
              className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="Örn: A4_3x7_Etiket"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              required
            />
          </div>

          {/* Sayfa Boyutu Seçimi */}
          <div>
            <label htmlFor="pageSizeType" className="block text-gray-700 text-sm font-bold mb-2">
              Sayfa Boyutu:
            </label>
            <select
              id="pageSizeType"
              className="shadow border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              value={pageSizeType}
              onChange={(e) => setPageSizeType(e.target.value)}
            >
              <option value="A4">A4 (210mm x 297mm)</option>
              <option value="A5">A5 (148mm x 210mm)</option>
              <option value="Letter">Letter (215.9mm x 279.4mm)</option>
              <option value="Custom">Özel Boyut</option>
            </select>
            {/* Özel Boyut seçilirse genişlik ve yükseklik girişleri */}
            {pageSizeType === 'Custom' && (
              <div className="flex gap-4 mt-4">
                <div className="flex-1">
                  <label htmlFor="customWidth" className="block text-gray-700 text-sm font-bold mb-2">
                    Genişlik (mm):
                  </label>
                  <input
                    type="number"
                    id="customWidth"
                    className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Örn: 200"
                    value={customPageWidth}
                    onChange={(e) => setCustomPageWidth(e.target.value)}
                    min="1"
                    required={pageSizeType === 'Custom'}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="customHeight" className="block text-gray-700 text-sm font-bold mb-2">
                    Yükseklik (mm):
                  </label>
                  <input
                    type="number"
                    id="customHeight"
                    className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Örn: 280"
                    value={customPageHeight}
                    onChange={(e) => setCustomPageHeight(e.target.value)}
                    min="1"
                    required={pageSizeType === 'Custom'}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sayfa Kenar Boşlukları */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Sayfa Kenar Boşlukları (mm):</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="marginTop" className="block text-gray-700 text-sm font-bold mb-2">
                  Üst:
                </label>
                <input
                  type="number"
                  id="marginTop"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={marginTop}
                  onChange={(e) => setMarginTop(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div>
                <label htmlFor="marginRight" className="block text-gray-700 text-sm font-bold mb-2">
                  Sağ:
                </label>
                <input
                  type="number"
                  id="marginRight"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={marginRight}
                  onChange={(e) => setMarginRight(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div>
                <label htmlFor="marginBottom" className="block text-gray-700 text-sm font-bold mb-2">
                  Alt:
                </label>
                <input
                  type="number"
                  id="marginBottom"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={marginBottom}
                  onChange={(e) => setMarginBottom(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div>
                <label htmlFor="marginLeft" className="block text-gray-700 text-sm font-bold mb-2">
                  Sol:
                </label>
                <input
                  type="number"
                  id="marginLeft"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={marginLeft}
                  onChange={(e) => setMarginLeft(e.target.value)}
                  min="0"
                  required
                />
              </div>
            </div>
          </div>

          {/* Etiket Boyutları */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Etiket Boyutları (mm):</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="labelWidth" className="block text-gray-700 text-sm font-bold mb-2">
                  Genişlik:
                </label>
                <input
                  type="number"
                  id="labelWidth"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={labelWidth}
                  onChange={(e) => setLabelWidth(e.target.value)}
                  min="1"
                  required
                />
              </div>
              <div>
                <label htmlFor="labelHeight" className="block text-gray-700 text-sm font-bold mb-2">
                  Yükseklik:
                </label>
                <input
                  type="number"
                  id="labelHeight"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={labelHeight}
                  onChange={(e) => setLabelHeight(e.target.value)}
                  min="1"
                  required
                />
              </div>
            </div>
          </div>

          {/* Etiket Araları */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Etiket Araları (mm):</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="gapHorizontal" className="block text-gray-700 text-sm font-bold mb-2">
                  Yatay:
                </label>
                <input
                  type="number"
                  id="gapHorizontal"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={gapHorizontal}
                  onChange={(e) => setGapHorizontal(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div>
                <label htmlFor="gapVertical" className="block text-gray-700 text-sm font-bold mb-2">
                  Dikey:
                </label>
                <input
                  type="number"
                  id="gapVertical"
                  className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={gapVertical}
                  onChange={(e) => setGapVertical(e.target.value)}
                  min="0"
                  required
                />
              </div>
            </div>
          </div>

          {/* Hata ve Başarı Mesajları */}
          {error && <p className="text-red-600 text-sm mt-4 text-center">{error}</p>}
          {message && <p className={`text-sm mt-4 text-center ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}

          {/* Kaydet/Güncelle ve İptal Butonları */}
          <div className="flex justify-center gap-4 pt-4 border-t mt-6">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md"
            >
              {editingTemplate ? 'Şablonu Güncelle' : 'Şablonu Kaydet'}
            </button>
            {editingTemplate && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-400 hover:bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Kayıtlı Şablonlar Listesi */}
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Kayıtlı Şablonlar</h2>
        {loading ? (
          <p className="text-gray-600 text-center">Şablonlar yükleniyor...</p>
        ) : templates.length === 0 ? (
          <p className="text-gray-600 text-center">Henüz kayıtlı şablon yok. Yukarıdan bir tane oluşturun!</p>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex-grow">
                  <h3 className="text-lg font-semibold text-gray-800">{template.name}</h3>
                  <p className="text-gray-600 text-sm">
                    Sayfa: {template.pageSize.type} ({template.pageSize.width}x{template.pageSize.height}mm) | Etiket: {template.labelDimensions.width}x{template.labelDimensions.height}mm
                  </p>
                  <p className="text-gray-600 text-sm">
                    Kenar Boşlukları: Üst:{template.margins.top}, Sağ:{template.margins.right}, Alt:{template.margins.bottom}, Sol:{template.margins.left}mm
                  </p>
                  <p className="text-gray-600 text-sm">
                    Etiket Araları: Yatay:{template.gapHorizontal}, Dikey:{template.gapVertical}mm
                  </p>
                </div>
                <div className="flex gap-2 mt-3 sm:mt-0">
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md text-sm"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-md text-sm"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
