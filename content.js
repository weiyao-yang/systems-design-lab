const art = {
  nodes: '<svg viewBox="0 0 100 80" fill="none" aria-hidden="true"><path d="M23 20L73 16L80 57L29 64Z M23 20L80 57 M73 16L29 64" stroke="#8c8ea8"/><circle cx="23" cy="20" r="10" fill="#2657ae"/><circle cx="73" cy="16" r="7" fill="#ff7940"/><circle cx="80" cy="57" r="11" fill="#fffdf2"/><circle cx="29" cy="64" r="8" fill="#2657ae"/></svg>',
  form: '<svg viewBox="0 0 100 80" aria-hidden="true"><path d="M22 29L52 12L80 28L50 46Z" fill="#6f98d2"/><path d="M22 29V58L50 74V46Z" fill="#2657ae"/><path d="M50 46L80 28V57L50 74Z" fill="#183f87"/><circle cx="69" cy="49" r="11" fill="#ff7940"/><path d="M33 34L61 18" stroke="#fffdf2" stroke-width="3"/></svg>',
  orbit: '<svg viewBox="0 0 100 80" fill="none" aria-hidden="true"><ellipse cx="50" cy="41" rx="37" ry="16" transform="rotate(-30 50 41)" stroke="#b17e61"/><ellipse cx="50" cy="41" rx="37" ry="16" transform="rotate(30 50 41)" stroke="#b17e61"/><circle cx="50" cy="41" r="17" fill="#2657ae"/><circle cx="80" cy="24" r="7" fill="#fffdf2"/><circle cx="18" cy="55" r="5" fill="#ff7940"/></svg>'
};

export const panels = [
  {
    id: 'projects',
    eyebrow: '01 / SELECTED EXPLORATIONS',
    kicker: 'IDEAS TAKING SHAPE',
    title: 'PROJECTS',
    titleZh: '实验项目',
    intro: 'Start with a question. Make abstract connections visible, tangible, and open to exploration.',
    introZh: '从一个问题出发，让抽象的关系变成可以看见、触碰和体验的事物。',
    body: `<div class="project-list">
      <article class="project-row"><div class="project-art">${art.nodes}</div><div><div class="project-meta">01 — SYSTEM MAPPING</div><h3>Hidden connections<small class="zh-copy">看不见的连接</small></h3><p>Map nodes and paths to explore how information flows.<small class="zh-copy">把复杂关系拆解为节点与路径，探索信息如何流动。</small></p></div><span class="project-number">01</span></article>
      <article class="project-row"><div class="project-art blue">${art.form}</div><div><div class="project-meta">02 — PHYSICAL INTERACTION</div><h3>Mechanical warmth<small class="zh-copy">有温度的机械</small></h3><p>Let movement respond to intent, and machines extend our curiosity.<small class="zh-copy">用动作回应人的意图，让机器成为好奇心的延伸。</small></p></div><span class="project-number">02</span></article>
      <article class="project-row"><div class="project-art orange">${art.orbit}</div><div><div class="project-meta">03 — DIGITAL EXPERIENCE</div><h3>Beyond the orbit<small class="zh-copy">轨道之外</small></h3><p>Use space and motion to open new ways of exploring.<small class="zh-copy">用空间与运动重新组织探索。</small></p></div><span class="project-number">03</span></article>
    </div><p class="demo-note">Illustrative concepts — ready for your real projects.<small class="zh-copy">概念展示内容 · 可替换为实验室的真实项目</small></p>`
  },
  {
    id: 'systems',
    eyebrow: '02 / SYSTEMS & CONNECTIONS',
    kicker: 'SEE THE WHOLE PICTURE',
    title: 'SYSTEMS DESIGN',
    titleZh: '系统设计',
    intro: 'Look beyond individual objects to the relationships between them. Design how the whole experience works.',
    introZh: '从单个对象走向对象之间的关系，理解整个体验如何运转。',
    body: `<div class="system-map"><div class="system-node">OBSERVE<small class="zh-copy">观察输入</small></div><div class="system-node primary">CONNECT<small class="zh-copy">理解关系</small></div><div class="system-node">RESPOND<small class="zh-copy">设计反馈</small></div></div>
      <div class="principle-row"><span>01</span><b>See the whole<small class="zh-copy">建立全局</small></b><p>Observe people, context, and constraints before defining the problem.<small class="zh-copy">先观察参与者、环境与限制，再确定问题的边界。</small></p></div>
      <div class="principle-row"><span>02</span><b>Find the links<small class="zh-copy">寻找连接</small></b><p>Connect information, actions, and feedback into a coherent experience.<small class="zh-copy">让信息流、行为与反馈彼此连贯。</small></p></div>
      <div class="principle-row"><span>03</span><b>Keep evolving<small class="zh-copy">持续演进</small></b><p>Test assumptions with prototypes. Make each response an input for the next iteration.<small class="zh-copy">通过原型检验假设，让反馈成为下一次设计的输入。</small></p></div>`
  },
  {
    id: 'prototypes',
    eyebrow: '03 / PLAY & PROTOTYPE',
    kicker: 'LESS THEORY. MORE PLAY.',
    title: 'PROTOTYPES',
    titleZh: '交互原型',
    intro: 'Put an idea in motion. Start a small experiment in orbits, relationships, and feedback.',
    introZh: '先让想法动起来，开启一场关于轨道、关系与反馈的小实验。',
    body: `<div class="prototype-stage" id="prototypeStage"><div class="prototype-ring"><div class="prototype-orb"></div></div></div>
      <div class="prototype-controls"><button class="primary-button" id="prototypePlay" aria-pressed="false">START EXPERIMENT ↗<small class="zh-copy">启动轨道实验</small></button><p id="prototypeStatus">READY / 等待输入</p></div>
      <p class="demo-note">Prototype 001 — every interaction changes the state of the system.<small class="zh-copy">原型 001 · 每一次交互，都让系统进入新的状态。</small></p>`
  },
  {
    id: 'about',
    eyebrow: '04 / PEOPLE',
    layout: 'people',
    body: `<div class="people-profile">
      <aside class="people-portrait">
        <img class="people-photo" src="assets/weiyao-yang.jpg" width="770" height="998" alt="杨玮尧博士 / Dr. Weiyao Yang" decoding="async">
        <nav class="people-links" aria-label="Weiyao Yang — contact and academic profiles">
          <a href="mailto:weiyao.yang@pku.edu.cn" aria-label="Email Weiyao Yang: weiyao.yang@pku.edu.cn" title="weiyao.yang@pku.edu.cn"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 6.6 4.7a2.4 2.4 0 0 0 2.8 0L20 7"/></svg></a>
          <a href="https://orcid.org/0009-0002-3872-4736" target="_blank" rel="noopener noreferrer" aria-label="Weiyao Yang on ORCID (opens in a new tab)" title="ORCID"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="7.7" cy="8" r=".9" fill="currentColor" stroke="none"/><path d="M7.7 10.5v6M11 7.5h2a4.5 4.5 0 0 1 0 9h-2z"/></svg></a>
          <a href="https://scholar.google.com/citations?user=42VUgP0AAAAJ&amp;hl=en" target="_blank" rel="noopener noreferrer" aria-label="Weiyao Yang on Google Scholar (opens in a new tab)" title="Google Scholar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 8.5 12 2l10.5 6.5L12 15z" fill="currentColor" stroke="none"/><path d="M6 12v4.5c0 2.2 2.7 4 6 4s6-1.8 6-4V12M22.5 8.5V16" fill="none"/></svg></a>
        </nav>
      </aside>
      <div class="people-identity">
        <header class="people-heading"><h2 id="panelTitle" lang="en">Weiyao YANG</h2><p class="people-name-zh" lang="zh-CN">杨玮尧</p></header>
        <div class="people-affiliations">
          <p><span lang="en">Postdoctoral Researcher</span> <span lang="zh-CN">博士后研究员</span></p>
          <p><span lang="en">Peking University</span> <span lang="zh-CN">北京大学</span></p>
          <p><span lang="en">School of Urban Planning and Design</span> <span lang="zh-CN">城市规划与设计学院</span></p>
        </div>
      </div>
      <article class="people-biography" aria-labelledby="panelTitle">
          <p lang="en">Dr. Weiyao Yang is a Postdoctoral Researcher at Peking University Shenzhen Graduate School and has been selected for the Guangdong Provincial Overseas Postdoctoral Talent Support Program; he also serves as Director of the Executive Office of the Guangdong Provincial Key Laboratory of Risk Perception and Sustainable Governance in Energy Transition. He previously served as a Senior Researcher at the Keio Research Institute at SFC, Keio University, Japan. He received his Ph.D. from Keio University’s Graduate School of Media and Governance. He has published over 20 research articles in internationally recognized journals indexed in the Web of Science Core Collection. He serves as principal investigator on projects under the Young Scientists Fund (Category C) of the National Natural Science Foundation of China and the Guangdong Province Philosophy and Social Sciences Planning Youth Project. He has completed over 80 peer reviews for more than 40 SCIE- and SSCI-indexed journals. His research focuses on data mining and AI-driven design. He explores the complexity and evolutionary dynamics of coupled human–nature–society systems and is committed to developing playful and engaging human–computer interaction systems. Guided by a “Paper-to-Product” (P2P) philosophy, he works to translate research into practical applications.</p>
          <p lang="zh-CN">杨玮尧博士，现为北京大学深圳研究生院博士后研究员，入选广东省海外博士后人才支持项目，并担任广东省能源转型风险感知与可持续治理重点实验室执行办公室主任。曾任日本庆应义塾大学SFC研究所高级研究员，博士毕业于日本庆应义塾大学政策与媒体研究科。累计发表SCI/SSCI期刊论文20余篇，主持国家自然科学基金青年科学基金项目（C类）、广东省哲学社会科学规划青年项目。已为40余本SCI/SSCI期刊完成80余次同行评审。研究兴趣聚焦数据挖掘与AI驱动设计，探索“人—自然—社会”耦合系统的复杂性与演化规律，并致力于开发兼具趣味性和参与感的人机交互系统。秉持“从论文到产品”（Paper-to-Product，P2P）理念，推动研究成果落地应用。</p>
      </article>
    </div>
    <section class="people-experience" aria-labelledby="peopleExperienceTitle">
      <h3 id="peopleExperienceTitle" lang="en">Education &amp; Work Experience <span lang="zh-CN">教育与工作经历</span></h3>
      <ul class="people-experience-list">
        <li><span class="people-experience-date">2025/07 — present</span>, <span lang="en">Postdoctoral Researcher, Peking University Shenzhen Graduate School.</span> <span class="people-experience-zh" lang="zh-CN">北京大学深圳研究生院，博士后研究员。</span></li>
        <li><span class="people-experience-date">2021/09 — 2025/03</span>, <span lang="en">Ph.D., Graduate School of Media and Governance, Keio University, Japan.</span> <span class="people-experience-zh" lang="zh-CN">日本庆应义塾大学，政策与媒体研究科，博士。</span></li>
        <li><span class="people-experience-date">2019/02 — 2021/07</span>, <span lang="en">Master’s degree in Landscape Architecture – Land Landscape Heritage, Politecnico di Milano, Italy.</span> <span class="people-experience-zh" lang="zh-CN">意大利米兰理工大学，风景园林与陆地景观遗产，硕士。</span></li>
        <li><span class="people-experience-date">2013/09 — 2017/07</span>, <span lang="en">Bachelor’s degree in Environmental Design, Shenyang Jianzhu University.</span> <span class="people-experience-zh" lang="zh-CN">沈阳建筑大学，环境设计，学士。</span></li>
      </ul>
    </section>`
  },
  {
    id: 'journal',
    eyebrow: '05 / NOTES IN PROGRESS',
    kicker: 'ALWAYS A WORK IN PROGRESS',
    title: 'FIELD NOTES',
    titleZh: '实验日志',
    intro: 'A place for questions, observations, and ideas that have yet to find their answers.',
    introZh: '记录问题，也记录那些还没找到答案的瞬间。',
    body: `<article class="journal-entry"><div class="journal-date"><b>NOTE 003</b>MOTION</div><div><h3>Can a turn express attention?<small class="zh-copy">一个转向，如何表达注意力？</small></h3><p>The base turns toward a target before the joints extend. A sequence of movements can feel like a moment of listening.<small class="zh-copy">底座先朝向目标，关节随后展开。动作的顺序，让机械像是在认真倾听。</small></p></div></article>
      <article class="journal-entry"><div class="journal-date"><b>NOTE 002</b>INTERACTION</div><div><h3>From button to spatial entrance<small class="zh-copy">从按钮到空间入口</small></h3><p>Arrange navigation around a subject, and a choice becomes a connection between direction, attention, and space.<small class="zh-copy">让导航围绕主体展开，使选择成为朝向与视线之间的连接。</small></p></div></article>
      <article class="journal-entry"><div class="journal-date"><b>NOTE 001</b>ORIGIN</div><div><h3>Give curiosity a robotic arm<small class="zh-copy">给好奇心一只机械臂</small></h3><p>Blue brings clarity. Orange adds warmth. A structured machine leaves room for a little play.<small class="zh-copy">蓝色代表理性，橙色保留温度。在严谨的结构里，保留一点玩心。</small></p></div></article>
      <p class="demo-note">Illustrative notes on this site's interaction concept.<small class="zh-copy">以上为页面交互概念的示例笔记。</small></p>`
  },
  {
    id: 'contact',
    eyebrow: '06 / MAKE A CONNECTION',
    kicker: 'EVERY CONNECTION STARTS WITH A HELLO',
    title: "LET'S CONNECT",
    titleZh: '联系与合作',
    intro: 'Have a question worth exploring? Capture your idea in a brief and keep the first step of a new connection.',
    introZh: '有一个值得探索的问题？写下你的想法，生成一份合作简报。',
    body: `<form class="contact-form" id="contactForm">
      <label><span>Your name<small class="zh-copy">如何称呼你</small></span><input name="name" autocomplete="name" placeholder="Your name" required maxlength="80"></label>
      <label><span>Email address<small class="zh-copy">联系邮箱</small></span><input type="email" name="email" autocomplete="email" placeholder="hello@example.com" required maxlength="160"></label>
      <label class="full"><span>What would you like to explore?<small class="zh-copy">你想一起探索什么？</small></span><textarea name="message" placeholder="A system, an interaction, or an idea still taking shape…" required maxlength="2000"></textarea></label>
      <button type="submit" class="primary-button">DOWNLOAD BRIEF ↓<small class="zh-copy">生成合作简报</small></button><p class="form-status" id="formStatus" role="status"></p>
    </form><p class="demo-note">Demo: the brief downloads to your device. Nothing is sent or uploaded.<small class="zh-copy">演示页面：简报仅下载到你的设备，不会发送或上传信息。</small></p>`
  }
];
