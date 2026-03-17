import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, Brain, Menu, MessageCircleMore, Shield, Sprout, X, Zap } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';

export const Services = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="ph-page services-page">
      <header className="ph-header">
        <div className="ph-shell ph-header-inner">
          <Link to="/" className="ph-brand">
            <BrandMark className="ph-brand-mark" />
            <span>Mekong Sight AI</span>
          </Link>

          <nav className="ph-nav">
            <Link to="/services" className="ph-nav-link is-active">
              Dịch vụ
            </Link>
            <a href="/#giai-phap" className="ph-nav-link">
              Giải pháp
            </a>
            <a href="/#tinh-nang" className="ph-nav-link">
              Tính năng
            </a>
            <a href="/#cong-dong" className="ph-nav-link">
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
            <a href="/#giai-phap" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Giải pháp
            </a>
            <a href="/#tinh-nang" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Tính năng
            </a>
            <a href="/#cong-dong" className="ph-mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Cộng đồng
            </a>
          </div>
        </div>
      </header>

      <main className="services-main">
        <section className="services-hero ph-shell">
          <div className="services-hero-copy">
            <p className="ph-chip">DỊCH VỤ THIẾT KẾ CHO NHÀ NÔNG</p>
            <h1>Dịch vụ đồng bộ với mùa vụ, dữ liệu và trợ lý AI</h1>
            <p>
              Bộ dịch vụ tập trung vào hỗ trợ quyết định nhanh, dễ hiểu và sát thực tế để bà con ứng
              dụng ngay trong quá trình nuôi trồng.
            </p>
            <div className="services-hero-actions">
              <Link to="/login" className="ph-btn ph-btn-primary ph-btn-large">
                Bắt đầu ngay <ArrowRight size={18} />
              </Link>
              <a href="#services-grid" className="ph-btn ph-btn-outline ph-btn-large">
                Xem chi tiết
              </a>
            </div>
          </div>

          <div className="services-hero-panel">
            <div className="services-stat">
              <strong>24/7</strong>
              <span>Trợ lý AI đồng hành</span>
            </div>
            <div className="services-stat">
              <strong>3 lớp</strong>
              <span>Dự báo, cảnh báo, khuyến nghị</span>
            </div>
            <div className="services-stat">
              <strong>Dễ dùng</strong>
              <span>Ưu tiên chữ lớn và nội dung rõ ràng</span>
            </div>
          </div>
        </section>

        <section id="services-grid" className="services-section ph-shell">
          <article className="services-detail-card">
            <div className="services-detail-visual">
              <div className="services-visual-badge">
                <Brain size={34} />
              </div>
              <div className="services-mini-chat">
                <div className="services-mini-bubble services-mini-bubble-user">Tôm có dấu hiệu yếu, tui hỏi ai?</div>
                <div className="services-mini-bubble services-mini-bubble-ai">
                  Trợ lý AI sẽ giải thích tình trạng và gợi ý cách xử lý theo dữ liệu thực địa.
                </div>
              </div>
            </div>

            <div className="services-detail-copy">
              <span className="services-icon-wrap">
                <Bot size={26} />
              </span>
              <h2>Trợ lý AI chuyên gia</h2>
              <p>
                Trợ lý AI hỗ trợ giải thích dữ liệu, nhận diện dấu hiệu bất thường qua mô tả hoặc hình
                ảnh và gợi ý bước xử lý tiếp theo theo ngữ cảnh sản xuất.
              </p>
              <ul className="services-list">
                <li>
                  <MessageCircleMore size={18} />
                  Tư vấn dễ hiểu, nói theo ngôn ngữ gần gũi
                </li>
                <li>
                  <MessageCircleMore size={18} />
                  Gợi ý hành động cụ thể thay vì chỉ hiển thị số liệu
                </li>
                <li>
                  <MessageCircleMore size={18} />
                  Hỗ trợ liên tục trong suốt mùa vụ
                </li>
              </ul>
            </div>
          </article>

          <article className="services-detail-card services-detail-card-alt">
            <div className="services-detail-copy">
              <span className="services-icon-wrap services-icon-wrap-lime">
                <BarChart3 size={26} />
              </span>
              <h2>Phân tích và dự báo</h2>
              <p>
                Tổng hợp dữ liệu mùa vụ, xu hướng môi trường và cảnh báo rủi ro để bà con nhìn ra vấn đề
                sớm hơn và ra quyết định chắc tay hơn.
              </p>
              <ul className="services-list">
                <li>
                  <Shield size={18} />
                  Dự báo xu hướng và điểm rủi ro cần chú ý
                </li>
                <li>
                  <Shield size={18} />
                  So sánh dữ liệu theo thời gian để phát hiện thay đổi
                </li>
                <li>
                  <Shield size={18} />
                  Khuyến nghị phù hợp theo từng giai đoạn mùa vụ
                </li>
              </ul>
            </div>

            <div className="services-detail-visual services-chart-visual">
              <div className="services-chart-bars">
                <span />
                <span />
                <span />
                <span />
              </div>
              <p>Phân tích xu hướng và cảnh báo rõ ràng trên cùng một màn hình</p>
            </div>
          </article>
        </section>

        <section className="services-section services-grid-section ph-shell">
          <div className="ph-title-wrap">
            <h2>Các dịch vụ hỗ trợ</h2>
            <p>Những phần bổ trợ giúp quá trình sử dụng hệ thống liền mạch và thực tế hơn.</p>
          </div>

          <div className="services-grid">
            <article className="services-grid-card">
              <span className="services-grid-icon">
                <Sprout size={28} />
              </span>
              <h3>Quản lý mùa vụ</h3>
              <p>Theo dõi chu kỳ chăm sóc và gợi ý lịch vận hành phù hợp với mô hình tôm - lúa.</p>
            </article>

            <article className="services-grid-card">
              <span className="services-grid-icon">
                <Shield size={28} />
              </span>
              <h3>Cảnh báo sớm</h3>
              <p>Ưu tiên hiển thị những thay đổi quan trọng để người dùng phản ứng nhanh hơn.</p>
            </article>

            <article className="services-grid-card">
              <span className="services-grid-icon">
                <Zap size={28} />
              </span>
              <h3>Tự động hóa</h3>
              <p>Kết nối quy trình vận hành để giảm thao tác thủ công và tiết kiệm thời gian.</p>
            </article>
          </div>
        </section>

        <section className="ph-cta ph-shell">
          <h2>Sẵn sàng bắt đầu cùng Mekong AI?</h2>
          <p>Đăng nhập để trải nghiệm bộ dịch vụ đồng bộ với giao diện PublicHome và trợ lý AI.</p>
          <div className="ph-cta-actions">
            <Link to="/login" className="ph-btn ph-btn-primary ph-btn-large">
              Bắt đầu ngay
            </Link>
            <Link to="/" className="ph-btn ph-btn-ghost ph-btn-large">
              Về trang chủ
            </Link>
          </div>
        </section>
      </main>

      <footer className="ph-footer">
        <div className="ph-shell ph-footer-inner">
          <div>
            <h3>Mekong AI</h3>
            <p>Nâng tầm nông nghiệp Việt Nam bằng AI và dữ liệu thực địa.</p>
          </div>
          <div className="ph-footer-links">
            <Link to="/services">Dịch vụ</Link>
            <a href="/#tinh-nang">Tính năng</a>
            <Link to="/login">Đăng nhập</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
