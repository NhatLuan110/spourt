# Nguồn nội dung và giấy phép

§12.4 — mọi nội dung học trong `content/` phải ghi rõ nguồn và giấy phép. Tuyệt
đối không sao chép nội dung có bản quyền từ các ứng dụng học tiếng Anh khác.

## Nguồn đang dùng

| Nguồn | Giấy phép | Dùng cho | Yêu cầu ghi công |
|-------|-----------|----------|------------------|
| [Wiktionary](https://en.wiktionary.org) | CC BY-SA 4.0 | Định nghĩa tiếng Anh, phiên âm | Ghi nguồn + giữ nguyên giấy phép cho phần phái sinh |
| [WordNet](https://wordnet.princeton.edu) | WordNet License (BSD-like) | Quan hệ đồng nghĩa, trái nghĩa | Ghi nguồn |
| [CMUdict](https://github.com/cmusphinx/cmudict) | BSD 2-Clause | Phiên âm, tách âm tiết, trọng âm | Ghi nguồn |
| [Tatoeba](https://tatoeba.org) | CC BY 2.0 FR | Câu ví dụ | Ghi nguồn + link tới câu gốc |
| [Project Gutenberg](https://www.gutenberg.org) | Public domain | Bài đọc trình độ cao | Không bắt buộc |
| [VOA Learning English](https://learningenglish.voanews.com) | Public domain (US Government) | Bài nghe, bài đọc | Không bắt buộc |
| [LibriVox](https://librivox.org) | Public domain | Audio | Không bắt buộc |

## Nội dung tự sinh

Bản dịch tiếng Việt, giải thích ngữ pháp và một phần câu ví dụ được soạn cho
Sprout. Phần nào do AI sinh ra **phải có người rà soát trước khi seed** và được
đánh dấu `reviewed: true` trong tệp nguồn.

## Trạng thái hiện tại

| Tệp | Số mục | Nguồn | Đã rà soát |
|-----|--------|-------|------------|
| `vocabulary/environment.yaml` | 8 từ | Wiktionary, WordNet, tự soạn | ✅ |
| `vocabulary/technology.yaml` | 8 từ | Wiktionary, WordNet, tự soạn | ✅ |

Chỉ tiêu §12.1 là 200–250 từ mỗi chủ đề. Hai tệp trên là mẫu chứng minh đường
ống seed chạy đúng; phần còn lại thuộc Phase P1.

## Còn thiếu

- **Audio US/UK cho mỗi từ** (§12.1). Cần khoá TTS hoặc bản ghi public domain;
  hiện `audioUsUrl`/`audioUkUrl` để trống và giao diện ẩn nút phát âm khi thiếu.
- Bài nghe, bài đọc, kịch bản role-play, đề viết: thuộc các phase sau.
