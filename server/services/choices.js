// 11.6 Hazır seçenekler: kullanıcı boş kutu karşısında düşünmesin diye her soruda seçilebilir cevaplar; özel durum için
// arayüzde her zaman "Diğer" alanı da vardır. Seçilen etiketler doğrudan ilgili alana metin olarak yazılır.
export const CHOICES = {
  sector: ['Kafe / restoran', 'Giyim ve moda', 'Güzellik ve bakım', 'Sağlık ve klinik', 'Eğitim / kurs', 'E-ticaret', 'Teknoloji / yazılım', 'Spor ve fitness', 'Emlak', 'Turizm ve otel', 'Kişisel marka / içerik üreticisi', 'Hizmet (ajans, danışmanlık)'],
  audience: ['Üniversite öğrencileri', '18–24 yaş gençler', '25–34 yaş çalışanlar', 'Aileler ve ebeveynler', 'Kadınlar', 'Erkekler', 'Yerel halk / mahalle', 'Profesyoneller ve işletmeler', 'Öğrenciler ve veliler', 'Turistler'],
  goals: ['Bilinirlik', 'Satış', 'Takipçi artışı', 'Topluluk ve etkileşim', 'Yeni ürün duyurusu', 'Mağazaya / mekâna ziyaret', 'Güven ve uzmanlık', 'Kampanya duyuruları'],
  character: ['Samimi', 'Esprili', 'Güven veren', 'Enerjik', 'Sakin', 'Lüks', 'Profesyonel', 'Genç ve dinamik', 'Bilgili / uzman', 'Sıcak ve içten'],
  tone: ['"Sen" diye hitap', '"Siz" diye hitap', 'Kısa cümleler', 'Emoji az ve yerinde', 'Emoji bol', 'Kurumsal değil, günlük dil', 'Resmî ve kurumsal', 'Esprili ve oyunbaz'],
  banned: ['Ünlü ve gerçek kişi adları', 'Rakip marka adları', 'Argo ve küfür', 'Abartılı fiyat / indirim vaadi', 'Siyasi ifadeler', 'Dini ifadeler', 'Sağlık vaadi (iyileştirir, tedavi eder)', '"En iyi", "bir numara" gibi kanıtsız üstünlük', 'Alkol ve sigara', 'Ucuz', 'Bedava'],
  preferred: ['Marka sloganı', 'Selamlama cümlesi', 'Kapanış cümlesi (ör. "Görüşmek üzere!")', 'Harekete çağrı (ör. "Hemen dene")'],
  mascotPersonality: ['Meraklı', 'Neşeli', 'Sakar ve komik', 'Bilge', 'Cesur', 'Utangaç', 'Enerjik', 'Sevimli']
};
