import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, Brain, Menu, MessageCircleMore, Shield, Sprout, X } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import anhtheimg from '../assets/img/anhthe.jpg';
import luaxanhimg from '../assets/img/luakhoe.jpg';
import tomkhoeimg from '../assets/img/tomkhoe.jpg';
const sectionIds = ['giai-phap', 'tinh-nang', 'cong-dong'] as const;

const marqueeItems = [
  'Cập nhật dữ liệu 5 phút/lần',
  'Bán kính phủ sóng 10km',
  'Giảm 40% rủi ro thiên tai',
];

export const PublicHome = () => {
  const [activeSection, setActiveSection] = useState<(typeof sectionIds)[number]>('giai-phap');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id as (typeof sectionIds)[number]);
        }
      },
      {
        rootMargin: '-35% 0px -45% 0px',
        threshold: [0.2, 0.45, 0.7],
      },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="ph-page">
      <header className="ph-header">
        <div className="ph-shell ph-header-inner">
          <Link to="/" className="ph-brand">
            <BrandMark className="ph-brand-mark" />
            <span>Mekong Sight AI</span>
          </Link>

          <nav className="ph-nav">
            <Link to="/services" className="ph-nav-link">
              Dịch vụ
            </Link>
            <a
              href="#giai-phap"
              className={`ph-nav-link ${activeSection === 'giai-phap' ? 'is-active' : ''}`}
            >
              Giải pháp
            </a>
            <a
              href="#tinh-nang"
              className={`ph-nav-link ${activeSection === 'tinh-nang' ? 'is-active' : ''}`}
            >
              Tính năng
            </a>
            <a
              href="#cong-dong"
              className={`ph-nav-link ${activeSection === 'cong-dong' ? 'is-active' : ''}`}
            >
              Cộng đồng
            </a>
          </nav>

          <div className="ph-header-actions">
            <Link to="/login" className="ph-btn ph-btn-soft ph-header-login">
              Đăng nhập
            </Link>
            <button
              type="button"
              className="ph-mobile-menu-toggle"
              aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        <div className={`ph-mobile-menu ${mobileMenuOpen ? 'is-open' : ''}`}>
          <div className="ph-shell ph-mobile-menu-inner">
            <Link to="/services" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Dịch vụ
            </Link>
            <a href="#giai-phap" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Giải pháp
            </a>
            <a href="#tinh-nang" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Tính năng
            </a>
            <a href="#cong-dong" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Cộng đồng
            </a>
          </div>
        </div>
      </header>

      <main className="ph-main ph-shell">
        <section className="ph-hero">
          <div className="ph-hero-bg" aria-hidden="true">
            <img
              src={anhtheimg}
              alt=""
            />
            <div className="ph-hero-overlay" />
          </div>

          <div className="ph-hero-content">
            <p className="ph-chip">CÔNG NGHỆ NHÌN THẤY TƯƠNG LAI</p>
            <h1>
              Tối ưu năng suất <span>Tôm - Lúa</span> bằng AI
            </h1>
            <p>
              Theo dõi xâm nhập mặn, phân tích ảnh bệnh thực tế và nhận cảnh báo trực tiếp để bà con
              xử lý đúng thời điểm.
            </p>
            <div className="ph-hero-actions">
              <Link to="/login" className="ph-btn ph-btn-primary ph-btn-large">
                Bảo vệ mùa vụ ngay <ArrowRight size={18} />
              </Link>
              <a href="#giai-phap" className="ph-btn ph-btn-outline ph-btn-large">
                Khám phá giải pháp
              </a>
            </div>
          </div>
        </section>

        <section className="ph-marquee" aria-label="Số liệu nổi bật">
          <div className="ph-marquee-fade ph-marquee-fade-left" />
          <div className="ph-marquee-fade ph-marquee-fade-right" />
          <div className="ph-marquee-track">
            {[...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, index) => (
              <div key={`${item}-${index}`} className="ph-marquee-item">
                <BrandMark className="ph-marquee-mark" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="giai-phap" className="ph-section ph-solution-section">
          <div className="ph-title-wrap">
            <h2>Giải pháp và thành quả</h2>
            <p>
              Hệ thống hướng dẫn xử lý dựa trên dữ liệu thực địa, giúp môi trường nước ổn định hơn và
              vụ mùa đều tay hơn.
            </p>
          </div>

          <article className="ph-compare-card ph-solution ph-solution-only">
            <div className="ph-compare-grid">
              <figure>
                <img
                  src= {luaxanhimg}
                  alt="Ruộng lúa xanh khỏe"
                />
                <figcaption>Lúa xanh, khỏe và phát triển đồng đều</figcaption>
              </figure>
              <figure>
                <img
                  src={tomkhoeimg}
                  alt="Thu hoạch tôm đạt chuẩn"
                />
                <figcaption>Tôm đạt chuẩn, chất lượng ổn định</figcaption>
              </figure>
            </div>
            <div className="ph-solution-copy">
              <Shield size={22} />
              <p>
                Dữ liệu từ camera, trạm nước và AI được quy đổi thành khuyến nghị để bà con hành động
                sớm và đúng lúc.
              </p>
            </div>
          </article>
        </section>

        <section id="tinh-nang" className="ph-section">
          <div className="ph-title-wrap">
            <h2>Tính năng nổi bật</h2>
            <p>Tập trung vào các tính năng dễ đọc, dễ hiểu và ra quyết định nhanh ngay trên điện thoại.</p>
          </div>

          <div className="ph-feature-grid ph-feature-grid-compact">
            <article className="ph-feature-card">
              <span className="ph-feature-icon">
                <Brain size={24} />
              </span>
              <h3>Cảnh báo tức thì</h3>
              <p>Thông báo sớm khi có dấu hiệu bất thường để xử lý ngay tại hiện trường.</p>
            </article>

            <article className="ph-feature-card">
              <span className="ph-feature-icon">
                <BarChart3 size={24} />
              </span>
              <h3>AI dự báo mùa vụ</h3>
              <p>Phân tích xu hướng và đề xuất thời điểm xuống giống, xử lý nước hợp lý.</p>
            </article>
          </div>
        </section>

        <section className="ph-chat-panel">
          <div className="ph-chat-copy">
            <p className="ph-chip">Trợ lý AI đồng hành</p>
            <h2>Trò chuyện trực tiếp với trợ lý AI</h2>
            <p>
              Thay vì một ô dashboard kỹ thuật, khu vực này hiển thị một cuộc hội thoại mẫu để người
              dùng cảm thấy gần gũi và dễ hình dung cách hệ thống hỗ trợ.
            </p>
            <div className="ph-chat-highlights">
              <span>
                <Bot size={16} /> Gợi ý cách xử lý
              </span>
              <span>
                <MessageCircleMore size={16} /> Trả lời theo ngữ cảnh
              </span>
            </div>
          </div>

          <div className="ph-chat-card">
            <div className="ph-chat-card-top">
              <div>
                <p className="ph-chat-title">Trợ lý AI Mekong</p>
                <p className="ph-chat-status">Đang online</p>
              </div>
              <span className="ph-chat-badge">Live chat</span>
            </div>

            <div className="ph-chat-thread">
              <div className="ph-chat-bubble ph-chat-bubble-user">
                Độ mặn hôm nay tăng nhanh, tui nên làm gì trước?
              </div>
              <div className="ph-chat-bubble ph-chat-bubble-ai">
                Nếu khu vực đang vượt ngưỡng 4.5 ppt, nên kiểm tra cống nước và tạm dừng cấp nước mới
                trong 12 giờ tới.
              </div>
              <div className="ph-chat-bubble ph-chat-bubble-ai">
                Tôi có thể gợi ý quy trình xử lý ao tôm hoặc ruộng lúa tùy theo khu vực của mình.
              </div>
            </div>

            <div className="ph-chat-input">
              <span>Hỏi trợ lý AI về độ mặn, bệnh tôm, lịch mùa vụ...</span>
              <button type="button" className="ph-btn ph-btn-primary">
                Gửi
              </button>
            </div>
          </div>
        </section>

        <section id="cong-dong" className="ph-human">
          <div className="ph-human-content">
            <p className="ph-chip">Gần gũi với nhà nông</p>
            <h2>Dễ dàng làm quen và sử dụng</h2>
            <p>Thiết kế đơn giản, chữ lớn và cảnh báo rõ để ai cũng dùng được, kể cả ngoài ruộng.</p>
            <div className="ph-human-points">
              <article>
                <Sprout size={24} />
                <h3>Dễ đọc ngoài nắng</h3>
                <p>Thông tin quan trọng được ưu tiên hiển thị rõ ràng.</p>
              </article>
              <article>
                <Brain size={24} />
                <h3>Hỗ trợ theo ngữ cảnh</h3>
                <p>AI diễn giải kết quả thành hành động cụ thể, dễ làm theo.</p>
              </article>
            </div>
          </div>

          <aside className="ph-quote-card">
            <img
              src="https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&q=80&w=1200"
              alt="Nông dân kiểm tra dữ liệu trên điện thoại"
            />
            <blockquote>
              Từ ngày dùng hệ thống, tui ở nhà vẫn biết ao mặn ngọt ra sao. Đỡ cực mà tôm lúa đều tốt
              hơn.
            </blockquote>
            <p>- Chú Bảy, Bến Tre</p>
          </aside>
        </section>

        <section className="ph-cta">
          <h2>Mang sức mạnh AI về với cánh đồng của bạn</h2>
          <p>Tham gia cùng cộng đồng nông dân đang bảo vệ mùa vụ bằng dữ liệu thực địa.</p>
          <div className="ph-cta-actions">
            <Link to="/login" className="ph-btn ph-btn-primary ph-btn-large">
              Đăng ký miễn phí
            </Link>
            <Link to="/services" className="ph-btn ph-btn-ghost ph-btn-large">
              Xem dịch vụ
            </Link>
          </div>
        </section>
      </main>

      <footer className="ph-footer">
        <div className="ph-shell ph-footer-inner">
          <div>
            <h3>Mekong Sight AI</h3>
            <p>Nâng tầm nông nghiệp Việt Nam bằng AI và dữ liệu thực địa.</p>
          </div>
          <div className="ph-footer-links">
            <Link to="/services">Dịch vụ</Link>
            <a href="#tinh-nang">Tính năng</a>
            <Link to="/login">Đăng nhập</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
