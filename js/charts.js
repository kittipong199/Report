(() => {
  'use strict';

  /* ==========================================================
     CHART ENGINE

     หน้าที่:
     - วาดกราฟลง Canvas เดิมใน HTML

     HTML Canvas IDs:
     #userChart    -> Top Users by Usage Hours
     #serviceChart -> Top Services by Usage Hours
     #trendChart   -> Monthly Usage Hours
     #tokenChart   -> Monthly Token Consumption
  ========================================================== */

  const AVEVA = window.AVEVA;

  AVEVA.groupUsage = (rows, key) => {
    const grouped = new Map();

    rows.forEach((row) => {
      grouped.set(key ? row[key] : row, (grouped.get(key ? row[key] : row) || 0) + row.hours);
    });

    return [...grouped].sort((a, b) => b[1] - a[1]);
  };

  AVEVA.prepareCanvas = (id) => {
    const canvas = AVEVA.$(id);
    const box = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    canvas.width = box.width * ratio;
    canvas.height = 270 * ratio;

    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    return {
      context,
      width: box.width,
      height: 270
    };
  };

  AVEVA.drawBars = (id, data, suffix = '') => {
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);

    const topTen = data.slice(0, 10);
    const maximum = Math.max(...topTen.map((item) => item[1]), 1);

    topTen.forEach((item, index) => {
      const y = 15 + index * 24;
      const barWidth = ((width - 210) * item[1]) / maximum;

      context.fillStyle = '#245783';
      context.fillRect(150, y, barWidth, 15);

      context.fillStyle = '#526579';
      context.textAlign = 'right';
      context.fillText(String(item[0]).slice(0, 22), 145, y + 12);

      context.textAlign = 'left';
      context.fillText(`${AVEVA.fmt(item[1])}${suffix}`, 155 + barWidth, y + 12);
    });
  };

  AVEVA.drawLine = (id, data) => {
    const { context, width, height } = AVEVA.prepareCanvas(id);
    context.clearRect(0, 0, width, height);

    if (!data.length) {
      return;
    }

    const maximum = Math.max(...data.map((item) => item[1]), 1);
    const points = data.map((item, index) => [
      50 + ((width - 80) * index) / Math.max(data.length - 1, 1),
      20 + (height - 70) * (1 - item[1] / maximum),
      item[0]
    ]);

    context.beginPath();
    points.forEach((point, index) => {
      if (index) {
        context.lineTo(point[0], point[1]);
      } else {
        context.moveTo(point[0], point[1]);
      }
    });

    context.strokeStyle = '#2878c1';
    context.lineWidth = 2;
    context.stroke();

    points.forEach((point) => {
      context.fillStyle = '#245783';
      context.beginPath();
      context.arc(point[0], point[1], 3, 0, 7);
      context.fill();
      context.textAlign = 'center';
      context.fillText(
        `${String(point[2]).slice(5)}/${String(point[2]).slice(0, 4)}`,
        point[0],
        height - 16
      );
    });
  };

  AVEVA.drawCharts = (usageRows, governance) => {
    AVEVA.drawBars('userChart', AVEVA.groupUsage(usageRows, 'name'), ' h');
    AVEVA.drawBars('serviceChart', AVEVA.groupUsage(usageRows, 'service'), ' h');

    AVEVA.drawLine(
      'trendChart',
      [...AVEVA.groupUsage(usageRows, 'period')].sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]))
      )
    );

    AVEVA.drawLine('tokenChart', [...governance.monthly.entries()].sort());
  };
})();
