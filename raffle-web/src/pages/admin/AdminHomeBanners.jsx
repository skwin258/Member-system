import { useEffect, useState } from "react";
import { api } from "../../api";
import { bannerImage, homeBannersWithDefaults } from "../../lib/homeBanners";

const photoTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function BannerEditor({ banner }) {
  const [current, setCurrent] = useState(banner);
  const [link, setLink] = useState(banner.link_url);
  const [file, setFile] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [fileVersion, setFileVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function save(event) {
    event.preventDefault();
    if (saving || (current.deleted && !file && !uploadedUrl)) return;
    setSaving(true);
    setStatus("");
    try {
      const patch = { link_url: link.trim() };
      let imageUrl = uploadedUrl;
      if (file) {
        if (!photoTypes.includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
          throw new Error("請選擇 8 MB 以內的 JPG、PNG、WebP 或 GIF 圖片");
        }
        const upload = await api.adminUploadBanner(file);
        if (!upload?.success || !upload.url) throw new Error(upload?.error || "圖片上傳失敗");
        imageUrl = upload.url;
        setUploadedUrl(imageUrl);
        setFile(null);
        setFileVersion(version => version + 1);
      }
      if (imageUrl) patch.image_url = imageUrl;
      const result = await api.adminSaveBanner(current.slot, patch);
      if (!result?.success) throw new Error(result?.error || "儲存失敗");
      setCurrent(previous => ({ ...previous, ...result.item }));
      setLink(result.item.link_url);
      setUploadedUrl("");
      setStatus("已儲存");
    } catch (error) {
      setStatus(error.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving || !window.confirm(`確定刪除 Banner ${current.slot}？`)) return;
    setSaving(true);
    setStatus("");
    try {
      const result = await api.adminDeleteBanner(current.slot);
      if (!result?.success) throw new Error(result?.error || "刪除失敗");
      setCurrent(result.item);
      setLink("");
      setFile(null);
      setUploadedUrl("");
      setFileVersion(version => version + 1);
      setStatus("已刪除");
    } catch (error) {
      setStatus(error.message || "刪除失敗");
    } finally {
      setSaving(false);
    }
  }

  return <form className="adminCard home-banner-editor" onSubmit={save}>
    <h3>Banner {current.slot}</h3>
    {current.deleted ? <p>這個位置目前沒有圖片。</p> : (
      <img src={bannerImage(current.image_url)} alt={`目前的 Banner ${current.slot}`} loading="lazy" />
    )}
    <label>{current.deleted ? "上傳圖片" : "更換圖片"}
      <input key={fileVersion} type="file" accept={photoTypes.join(",")} disabled={saving}
        onChange={event => {
          setFile(event.target.files[0] || null);
          setUploadedUrl("");
        }} />
    </label>
    {uploadedUrl && <small>新圖片已上傳，儲存後會套用到首頁。</small>}
    <label>跳轉連結
      <input className="input" value={link} onChange={event => setLink(event.target.value)} disabled={saving}
        maxLength={2048} placeholder="https://example.com 或 /站內路徑" />
    </label>
    <div className="home-banner-actions">
      <button type="submit" className="btn" disabled={saving || (current.deleted && !file && !uploadedUrl)}>
        {saving ? "處理中…" : "儲存 Banner"}
      </button>
      {!current.deleted && <button type="button" className="btn" disabled={saving} onClick={remove}>刪除 Banner</button>}
    </div>
    {status && <span role="status">{status}</span>}
  </form>;
}

export default function AdminHomeBanners() {
  const [banners, setBanners] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.homeBanners({ signal: controller.signal }).then(result => {
      if (!result?.success) throw new Error(result?.error || "讀取失敗");
      if (!controller.signal.aborted) setBanners(homeBannersWithDefaults(result.items));
    }).catch(err => {
      if (!controller.signal.aborted) setError(err.message || "讀取失敗");
    });
    return () => controller.abort();
  }, [attempt]);

  return <div>
    <p>首頁四個輪播位置都可更換或刪除。連結留空時，點擊圖片不會跳轉。</p>
    {error ? <>
      <p role="alert">{error}</p>
      <button type="button" className="btn" onClick={() => { setError(""); setAttempt(count => count + 1); }}>重新讀取</button>
    </> : banners ? (
      <div className="home-banner-grid">
        {banners.map(banner => <BannerEditor key={banner.slot} banner={banner} />)}
      </div>
    ) : <p role="status">讀取 Banner 設定中…</p>}
  </div>;
}
