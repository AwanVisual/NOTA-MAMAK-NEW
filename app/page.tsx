'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Printer, Save, Plus, Trash2, Edit, RefreshCw, History, X } from 'lucide-react';

// Deklarasi tipe agar TypeScript mengenali navigator.bluetooth tanpa error
declare global {
  interface Navigator {
    bluetooth?: any;
  }
}

export default function PosApp() {
  // 1. State Pengaturan Toko
  const [shop, setShop] = useState({ name: '', address: '' });
  
  // 2. State Transaksi Utama
  const [trxInfo, setTrxInfo] = useState({
    date: '',
    time: '',
    number: '',
    cashier: 'Admin'
  });

  // 3. State Member
  const [member, setMember] = useState({ id: '', name: '', address: '' });

  // 4. State Barang
  const [items, setItems] = useState<{name: string, qty: number, price: number, discount: number}[]>([]);
  const [currentItem, setCurrentItem] = useState({ name: '', qty: 1, price: 0, discount: 0 });

  // 5. State Kontrol & Riwayat
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);

  // Inisialisasi Data Awal (Toko & Waktu)
  useEffect(() => {
    const fetchShop = async () => {
      const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).single();
      if (data) setShop({ name: data.shop_name, address: data.shop_address });
    };
    fetchShop();
    resetTransactionForm();
  }, []);

  // Fungsi generate nomor struk dan reset form untuk TRANSAKSI BARU
  const resetTransactionForm = () => {
    const now = new Date();
    // Menyesuaikan zona waktu lokal (WITA / Waktu Setempat)
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    setTrxInfo({
      date: localDate,
      time: now.toTimeString().substring(0, 5),
      number: 'TRX-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      cashier: 'Admin'
    });
    setMember({ id: '', name: '', address: '' });
    setItems([]);
    setSavedReceiptId(null);
  };

  // Fungsi simpan pengaturan toko
  const saveShopSettings = async () => {
    await supabase
      .from('shop_settings')
      .update({ shop_name: shop.name, shop_address: shop.address })
      .eq('id', 1);
    alert('Pengaturan Toko Tersimpan!');
  };

  // Tambah Barang ke Keranjang
  const handleAddItem = () => {
    if (!currentItem.name || currentItem.price <= 0) return alert('Nama dan Harga barang wajib diisi!');
    setItems([...items, currentItem]);
    setCurrentItem({ name: '', qty: 1, price: 0, discount: 0 }); // reset form input barang
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  // Kalkulasi Total
  const subtotal = items.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const totalDiscount = items.reduce((acc, item) => acc + Number(item.discount), 0);
  const grandTotal = subtotal - totalDiscount;

  // SIMPAN ATAU UPDATE TRANSAKSI
  const handleSaveTransaction = async () => {
    if (items.length === 0) return alert('Keranjang masih kosong!');
    setIsSaving(true);

    const transactionTimestamp = new Date(`${trxInfo.date}T${trxInfo.time}:00`).toISOString();

    const receiptPayload = {
      transaction_number: trxInfo.number,
      transaction_date: transactionTimestamp,
      admin_name: trxInfo.cashier,
      member_id: member.id,
      member_name: member.name,
      member_address: member.address,
      subtotal: subtotal,
      tax: 0,
      grand_total: grandTotal
    };

    try {
      let currentReceiptId = savedReceiptId;

      if (currentReceiptId) {
        // UPDATE transaksi lama
        await supabase.from('receipts').update(receiptPayload).eq('id', currentReceiptId);
        await supabase.from('receipt_items').delete().eq('receipt_id', currentReceiptId);
      } else {
        // SIMPAN transaksi baru
        const { data, error } = await supabase.from('receipts').insert([receiptPayload]).select().single();
        if (error) throw error;
        currentReceiptId = data.id;
        setSavedReceiptId(currentReceiptId);
      }

      // Insert ulang Items
      const formattedItems = items.map(item => ({
        receipt_id: currentReceiptId,
        item_name: item.name,
        qty: item.qty,
        price: item.price,
        discount: item.discount,
        total: (item.qty * item.price) - item.discount
      }));

      await supabase.from('receipt_items').insert(formattedItems);
      alert('Transaksi Berhasil Disimpan!');
      
    } catch (error) {
      console.error(error);
      alert('Gagal menyimpan transaksi.');
    } finally {
      setIsSaving(false);
    }
  };

  // ================= FITUR RIWAYAT TRANSAKSI ================= //
  
  // Ambil daftar riwayat transaksi
  const fetchHistory = async () => {
    setIsHistoryOpen(true);
    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50); // Ambil 50 transaksi terakhir
    
    if (data && !error) {
      setHistoryData(data);
    }
  };

  // Muat transaksi lama ke layar utama untuk di-print ulang / di-edit
  const loadTransaction = async (receipt: any) => {
    const [date, time] = new Date(receipt.transaction_date).toISOString().split('T');
    
    setTrxInfo({
      date: date,
      time: time.substring(0, 5),
      number: receipt.transaction_number,
      cashier: receipt.admin_name
    });
    setMember({
      id: receipt.member_id || '',
      name: receipt.member_name || '',
      address: receipt.member_address || ''
    });
    setSavedReceiptId(receipt.id);

    // Tarik item untuk transaksi ini
    const { data: itemsData } = await supabase
      .from('receipt_items')
      .select('*')
      .eq('receipt_id', receipt.id);
      
    if (itemsData) {
      setItems(itemsData.map((item: any) => ({
        name: item.item_name,
        qty: item.qty,
        price: item.price,
        discount: item.discount
      })));
    }
    
    setIsHistoryOpen(false); // Tutup modal
  };

  // =========================================================== //

  // LOGIKA CETAK PRINTER (Bluetooth ESC/POS - Hemat Kertas 1 Baris)
  const handlePrint = async () => {
    if (!savedReceiptId) return alert('Harap simpan transaksi terlebih dahulu sebelum mencetak!');
    
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      return alert('Web Bluetooth API tidak tersedia. Pastikan Anda menggunakan Chrome/Edge dan mengakses web melalui localhost atau HTTPS.');
    }

    try {
      // 1. Request Device (Meminta izin koneksi ke printer)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // UUID Standar Thermal Printer
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2'  // UUID Alternatif Serial
        ] 
      });

      console.log('Menghubungkan ke printer...');
      
      // 2. Konek ke GATT Server
      const server = await device.gatt.connect();

      // 3. Cari Service & Characteristic (Jalur untuk mengirim data ke printer)
      let service, characteristic;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        // Fallback jika printer menggunakan UUID alternatif
        service = await server.getPrimaryService('e7810a71-73ae-499d-8c15-faa9aef0c3f2');
        characteristic = await service.getCharacteristic('bef8d6c9-9c21-4c9e-b632-bd58c1009f9f');
      }

      // 4. SUSUN TEKS STRUK (Kertas 80mm = 48 karakter per baris)
      const LINE_WIDTH = 48;
      let receiptText = "";
      
      receiptText += "\x1B\x40"; // Perintah inisialisasi printer
      receiptText += "\x1B\x33\x14"; // Rapatkan jarak antar-baris (line spacing)
      
      // HEADER (Tengah)
      receiptText += "\x1B\x61\x01"; // Align Center
      receiptText += `${(shop.name || 'NAMA TOKO').toUpperCase()}\n`;
      if (shop.address) receiptText += `${shop.address}\n`;
      receiptText += "-".repeat(LINE_WIDTH) + "\n";
      
      // INFO TRANSAKSI (2 kolom per baris)
      receiptText += "\x1B\x61\x00"; // Align Left
      const noStr = `No: ${trxInfo.number}`;
      const tglStr = `${trxInfo.date} ${trxInfo.time}`;
      receiptText += noStr + " ".repeat(Math.max(1, LINE_WIDTH - noStr.length - tglStr.length)) + tglStr + "\n";

      const kasirStr = `Kasir: ${trxInfo.cashier}`;
      const memberStr = `Mbr: ${member.name || '-'}`;
      receiptText += kasirStr + " ".repeat(Math.max(1, LINE_WIDTH - kasirStr.length - memberStr.length)) + memberStr + "\n";
      receiptText += "-".repeat(LINE_WIDTH) + "\n";
      
      // DAFTAR BARANG (Format 1 Baris: Nama Barang + QtyxHarga + Total)
      items.forEach(item => {
        const qtyPrice = `${item.qty}x${item.price.toLocaleString('id-ID')}`;
        const itemTotal = ((item.price * item.qty) - item.discount).toLocaleString('id-ID');
        
        const rightSide = ` ${qtyPrice} ${itemTotal.padStart(9, ' ')}`;
        const maxNameLen = Math.max(10, LINE_WIDTH - rightSide.length);
        const cleanName = item.name.length > maxNameLen 
          ? item.name.substring(0, maxNameLen) 
          : item.name.padEnd(maxNameLen, ' ');

        receiptText += `${cleanName}${rightSide}\n`;

        if (item.discount > 0) {
          const discStr = `(Disc: -${item.discount.toLocaleString('id-ID')})`;
          receiptText += discStr.padStart(LINE_WIDTH, ' ') + "\n";
        }
      });
      
      receiptText += "-".repeat(LINE_WIDTH) + "\n";
      
      // TOTAL (Satu baris rata kiri-kanan)
      const labelTotal = "GRAND TOTAL";
      const valTotal = `Rp ${grandTotal.toLocaleString('id-ID')}`;
      receiptText += "\x1B\x45\x01"; // Bold ON
      receiptText += labelTotal + " ".repeat(Math.max(1, LINE_WIDTH - labelTotal.length - valTotal.length)) + valTotal + "\n";
      receiptText += "\x1B\x45\x00"; // Bold OFF
      
      // FOOTER (Tengah)
      receiptText += "\x1B\x61\x01"; // Align Center
      receiptText += "Terima Kasih - Barang yg dibeli tdk dpt ditukar\n";
      receiptText += "\n\n\n"; // Feed kertas secukupnya sebelum dipotong
      
      receiptText += "\x1D\x56\x00"; // Perintah Potong Kertas Otomatis (Full Cut)

      // 5. ENCODE & KIRIM DATA KE PRINTER (Dalam chunk kecil/potongan)
      const encoder = new TextEncoder();
      const data = encoder.encode(receiptText);
      const CHUNK_SIZE = 100; 

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await characteristic.writeValue(chunk);
      }

      console.log('Struk berhasil dicetak!');
      device.gatt?.disconnect();

    } catch (err: any) {
      console.error('Gagal konek/cetak:', err);
      alert('Gagal mencetak: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col xl:flex-row gap-6 font-sans text-sm relative">
      
      {/* MODAL RIWAYAT TRANSAKSI */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg flex items-center gap-2"><History size={20}/> Riwayat Transaksi (50 Terakhir)</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-gray-500 hover:text-red-500 bg-gray-200 hover:bg-red-100 p-2 rounded-full transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="bg-gray-100 text-gray-600 sticky top-0 shadow-sm">
                  <tr>
                    <th className="p-3">Waktu</th>
                    <th className="p-3">No Struk</th>
                    <th className="p-3">Kasir</th>
                    <th className="p-3">Member</th>
                    <th className="p-3">Total</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-gray-500">Belum ada riwayat transaksi</td></tr>
                  ) : (
                    historyData.map((trx, idx) => (
                      <tr key={idx} className="border-t hover:bg-blue-50 transition">
                        <td className="p-3">{new Date(trx.transaction_date).toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
                        <td className="p-3 font-medium text-blue-600">{trx.transaction_number}</td>
                        <td className="p-3">{trx.admin_name}</td>
                        <td className="p-3">{trx.member_name || '-'}</td>
                        <td className="p-3 font-bold">Rp {trx.grand_total.toLocaleString('id-ID')}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => loadTransaction(trx)} className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-xs font-semibold shadow-sm">
                            Buka & Cetak
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* KIRI: AREA INPUT & PENGATURAN */}
      <div className="flex-1 space-y-4">
        
        {/* Tombol Header */}
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold text-gray-800">Sistem POS IWare</h1>
          <button onClick={fetchHistory} className="bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-700 shadow-sm">
            <History size={16} /> Buka Riwayat Transaksi
          </button>
        </div>

        {/* Row 0: Pengaturan Toko */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Printer size={18} /> Pengaturan Toko
            </h2>
            <button onClick={saveShopSettings} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-md flex items-center gap-1 hover:bg-blue-100 transition">
              <Save size={14} /> Simpan Toko
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" className="w-full border p-2 rounded" value={shop.name} onChange={e => setShop({...shop, name: e.target.value})} placeholder="Nama Toko" />
            <input type="text" className="w-full border p-2 rounded" value={shop.address} onChange={e => setShop({...shop, address: e.target.value})} placeholder="Alamat Toko" />
          </div>
        </div>

        {/* Row 1: Toko & Info Transaksi */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">Info Transaksi</h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="date" className="border p-2 rounded" value={trxInfo.date} onChange={e => setTrxInfo({...trxInfo, date: e.target.value})} />
              <input type="time" className="border p-2 rounded" value={trxInfo.time} onChange={e => setTrxInfo({...trxInfo, time: e.target.value})} />
            </div>
            <div className="flex gap-2 mb-2">
              <input type="text" className="border p-2 rounded flex-1" value={trxInfo.number} onChange={e => setTrxInfo({...trxInfo, number: e.target.value})} placeholder="No. Struk" />
              <button onClick={() => setTrxInfo({...trxInfo, number: 'TRX-' + Math.random().toString(36).substring(2, 8).toUpperCase()})} className="bg-gray-100 p-2 rounded hover:bg-gray-200">
                <RefreshCw size={18} />
              </button>
            </div>
            <input type="text" className="w-full border p-2 rounded" value={trxInfo.cashier} onChange={e => setTrxInfo({...trxInfo, cashier: e.target.value})} placeholder="Nama Cashier" />
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-700 mb-3">Member & Alamat</h2>
            <input type="text" className="w-full border p-2 rounded mb-2" value={member.id} onChange={e => setMember({...member, id: e.target.value})} placeholder="ID Member (Opsional)" />
            <input type="text" className="w-full border p-2 rounded mb-2" value={member.name} onChange={e => setMember({...member, name: e.target.value})} placeholder="Nama Member" />
            <textarea className="w-full border p-2 rounded h-10" value={member.address} onChange={e => setMember({...member, address: e.target.value})} placeholder="Alamat Pengiriman/Member"></textarea>
          </div>
        </div>

        {/* Row 2: Tambah Barang */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Plus size={18} /> Tambah Barang
          </h2>
          <div className="flex flex-wrap md:flex-nowrap gap-2 items-end">
            <div className="w-full md:flex-1"><label className="text-xs text-gray-500">Nama Barang</label><input type="text" className="w-full border p-2 rounded" value={currentItem.name} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} /></div>
            <div className="w-24"><label className="text-xs text-gray-500">Qty</label><input type="number" min="1" className="w-full border p-2 rounded" value={currentItem.qty} onChange={e => setCurrentItem({...currentItem, qty: Number(e.target.value)})} /></div>
            <div className="w-32"><label className="text-xs text-gray-500">Harga</label><input type="number" className="w-full border p-2 rounded" value={currentItem.price} onChange={e => setCurrentItem({...currentItem, price: Number(e.target.value)})} /></div>
            <div className="w-32"><label className="text-xs text-gray-500">Diskon (Rp)</label><input type="number" className="w-full border p-2 rounded" value={currentItem.discount} onChange={e => setCurrentItem({...currentItem, discount: Number(e.target.value)})} /></div>
            <button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 h-[42px] px-6 font-semibold shadow-md">Tambah</button>
          </div>
        </div>

        {/* Tabel Preview Keranjang Sebelum Cetak */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
           <table className="w-full text-left">
             <thead className="bg-gray-50 text-gray-600">
               <tr>
                 <th className="p-2">Item</th>
                 <th className="p-2">Qty</th>
                 <th className="p-2">Harga</th>
                 <th className="p-2">Diskon</th>
                 <th className="p-2">Total</th>
                 <th className="p-2 text-center">Aksi</th>
               </tr>
             </thead>
             <tbody>
               {items.map((item, idx) => (
                 <tr key={idx} className="border-t">
                   <td className="p-2">{item.name}</td>
                   <td className="p-2">{item.qty}</td>
                   <td className="p-2">Rp {item.price.toLocaleString('id-ID')}</td>
                   <td className="p-2 text-red-500">-Rp {item.discount.toLocaleString('id-ID')}</td>
                   <td className="p-2 font-semibold">Rp {((item.price * item.qty) - item.discount).toLocaleString('id-ID')}</td>
                   <td className="p-2 text-center">
                     <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      </div>

      {/* KANAN: PANEL AKSI TRANSAKSI & PREVIEW STRUK */}
      <div className="w-full xl:w-[400px]">
        <div className="sticky top-6 flex flex-col gap-4">
          
          {/* Tombol Simpan / Update Transaksi */}
          <button 
            onClick={handleSaveTransaction}
            disabled={isSaving}
            className={`w-full py-4 rounded-lg shadow-md transition-colors text-lg flex justify-center items-center gap-2 font-bold ${savedReceiptId ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {isSaving ? 'Menyimpan...' : savedReceiptId ? <><Edit /> UPDATE TRANSAKSI</> : <><Save /> SIMPAN TRANSAKSI BARU</>}
          </button>

          {/* Visual Kertas Struk 80mm */}
          <div className="bg-white p-4 shadow-md rounded-lg font-mono text-xs border border-gray-200">
            <div className="text-center mb-2">
              <h3 className="font-bold text-base leading-tight">{shop.name || 'NAMA TOKO'}</h3>
              <p className="text-[11px] text-gray-500">{shop.address || 'Alamat Toko'}</p>
            </div>
            
            <div className="text-[11px] border-y border-dashed border-gray-400 py-1.5 my-1.5 flex flex-col gap-0.5">
              <div className="flex justify-between"><span>No: {trxInfo.number}</span><span>{trxInfo.date} {trxInfo.time}</span></div>
              <div className="flex justify-between"><span>Kasir: {trxInfo.cashier}</span><span>Member: {member.name || '-'}</span></div>
            </div>

            <div className="py-1 min-h-[80px] leading-tight">
               {items.length === 0 ? (
                 <p className="text-center text-gray-400 italic py-4">Belum ada barang...</p>
               ) : (
                 items.map((item, idx) => (
                   <div key={idx} className="py-0.5">
                     <div className="flex justify-between items-baseline gap-2">
                       <span className="truncate flex-1 font-medium">{item.name}</span>
                       <span className="text-gray-600 whitespace-nowrap">
                         {item.qty}x{item.price.toLocaleString('id-ID')}
                       </span>
                       <span className="whitespace-nowrap font-semibold min-w-[65px] text-right">
                         {((item.price * item.qty) - item.discount).toLocaleString('id-ID')}
                       </span>
                     </div>
                     {item.discount > 0 && (
                       <div className="text-right text-[10px] text-gray-500">
                         (Disc: -{item.discount.toLocaleString('id-ID')})
                       </div>
                     )}
                   </div>
                 ))
               )}
            </div>

            <div className="border-t border-dashed border-gray-400 pt-1.5 flex justify-between font-bold text-sm mt-1">
              <span>GRAND TOTAL</span>
              <span>Rp {grandTotal.toLocaleString('id-ID')}</span>
            </div>
          </div>
          
          {/* Tombol Cetak */}
          <button 
            onClick={handlePrint}
            disabled={!savedReceiptId}
            className={`w-full font-bold py-4 rounded-lg shadow-md transition-colors text-lg flex justify-center items-center gap-2 ${savedReceiptId ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            <Printer /> {savedReceiptId ? 'CETAK STRUK SEKARANG' : 'SIMPAN DULU UNTUK CETAK'}
          </button>
          
          {/* TOMBOL RESET SANGAT PENTING */}
          <button onClick={resetTransactionForm} className="mt-2 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-100 text-center w-full font-bold shadow-sm flex justify-center items-center gap-2">
            <Plus size={18} /> BUAT TRANSAKSI BARU
          </button>

        </div>
      </div>

    </div>
  );
}
